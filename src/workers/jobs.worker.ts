/**
 * Jobs worker — executes background copy / move / cleanup / sync tasks.
 *
 * Key design principles (matching Dropbox / rclone / Google Drive Backup):
 *
 *  1. STREAMING   — files are piped source → dest without buffering in RAM.
 *  2. IDEMPOTENCY — before copying, checks:
 *       a) Redis: has this file been marked done in a prior run?
 *       b) Destination snapshot: does a file with same name + size already exist?
 *     Either check → skip the file (no duplicate created).
 *  3. PER-FILE RETRY — transient errors (network, rate-limit, 5xx) are retried
 *     up to MAX_FILE_ATTEMPTS times with exponential back-off.
 *     Permanent errors (404, 403, not-exportable) skip the file immediately.
 *  4. FAULT TOLERANCE — individual file failures are non-fatal up to
 *     MAX_FAILURE_RATE (50 %). Only if too many files fail does the whole job fail.
 *  5. CRASH RECOVERY — on worker startup, any task stuck in 'running' is marked
 *     failed so the UI isn't left hanging.
 */

import { Worker, Job as BullJob } from 'bullmq';
import pLimit from 'p-limit';
import { createRedisConnection } from '../config/redis';
import { QUEUE_NAME, addDelayedJob } from '../config/queue';
import { supabaseAdmin } from '../config/supabase';
import { PLAN_LIMITS } from '../config/plans';
import { computeNextRunAt } from '../services/jobs.service';
import { getUserPlan, checkTransferLimit, recordTransferUsage } from '../services/subscriptions.service';
import {
  listProviderFiles,
  copyProviderFile,
  deleteProviderFile,
} from '../services/files.service';
import { GDriveNotExportableError, type GDriveSkipReason } from '../services/files-adapters';
import type { FileItem } from '../services/files-adapters';
import { markFileDone, isFileDone, loadDoneSet, clearTaskProgress } from '../lib/job-progress';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max per-file transfer attempts before treating it as a hard failure. */
const MAX_FILE_ATTEMPTS = 3;

/**
 * If more than this fraction of files fail with hard errors, abort the whole job.
 * e.g. 0.5 = tolerate up to 50 % failures before giving up.
 */
const MAX_FAILURE_RATE = 0.5;

/** Initial backoff delay (ms) — doubles on each retry: 500 → 1000 → 2000 */
const BASE_BACKOFF_MS = 500;

// ─── Error helpers ────────────────────────────────────────────────────────────

function friendlyError(err: any): string {
  const msg: string = err?.message ?? '';

  if (msg.includes('Google Drive')) {
    if (msg.includes('401')) return 'Google Drive: Session expired. Reconnect your Google Drive account and try again.';
    if (msg.includes('403')) return 'Google Drive: Access denied. Make sure the app still has permission to access this folder.';
    if (msg.includes('404')) return 'Google Drive: File or folder not found. It may have been moved or deleted.';
    if (msg.includes('export failed')) return 'Google Drive: Could not export this file type.';
    return 'Google Drive: An error occurred while processing files.';
  }
  if (msg.includes('OneDrive')) {
    if (msg.includes('401')) return 'OneDrive: Session expired. Reconnect your OneDrive account and try again.';
    if (msg.includes('403')) return 'OneDrive: Access denied. Check your OneDrive permissions.';
    if (msg.includes('404')) return 'OneDrive: File or folder not found. It may have been moved or deleted.';
    return 'OneDrive: An error occurred while processing files.';
  }
  if (msg.includes('Dropbox')) {
    if (msg.includes('401')) return 'Dropbox: Session expired. Reconnect your Dropbox account and try again.';
    if (msg.includes('403')) return 'Dropbox: Access denied. Check your Dropbox permissions.';
    return 'Dropbox: An error occurred while processing files.';
  }
  if (msg.includes('Box')) {
    if (msg.includes('401')) return 'Box: Session expired. Reconnect your Box account and try again.';
    if (msg.includes('403')) return 'Box: Access denied. Check your Box permissions.';
    return 'Box: An error occurred while processing files.';
  }

  const lower = msg.toLowerCase();
  if (lower.includes('quota') || lower.includes('storage full') || lower.includes('insufficient storage')) {
    return 'Not enough storage space in the destination. Free up space and try again.';
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return 'Network error. Check your internet connection and try again.';
  }
  if (msg && !msg.match(/^\s*Error:/i) && msg.length < 200) return msg;
  return 'An unexpected error occurred. Please try again or contact support.';
}

/**
 * Returns true for errors worth retrying (transient).
 * Returns false for permanent errors — skip the file, don't retry.
 */
function isRetriable(err: any): boolean {
  if (err instanceof GDriveNotExportableError) return false;
  if (err?.code === 'GDRIVE_NOT_EXPORTABLE')   return false;
  const msg: string = (err?.message ?? '').toLowerCase();
  // Permanent HTTP errors
  if (msg.includes('401') || msg.includes('403') || msg.includes('404') ||
      msg.includes('413') || msg.includes('415')) return false;
  // Anything else (network, 429, 5xx, timeout) is worth retrying
  return true;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

/**
 * Run `fn` up to `maxAttempts` times.
 * On a retriable error, wait with exponential back-off before the next attempt.
 * On a permanent error, throws immediately without further retries.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = MAX_FILE_ATTEMPTS,
  baseDelayMs = BASE_BACKOFF_MS,
): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (!isRetriable(err)) throw err; // permanent — don't retry
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[jobs-worker] Attempt ${attempt}/${maxAttempts} failed (${err?.message}). Retrying in ${delay}ms…`,
        );
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Collection helpers ───────────────────────────────────────────────────────

/** Collect every non-folder item in a provider folder (walks all pages). */
async function collectFiles(
  userId: string,
  providerId: string,
  folderId: string | null,
): Promise<FileItem[]> {
  const all: FileItem[] = [];
  let pageToken: string | null = null;
  do {
    const result = await listProviderFiles(userId, providerId, folderId, pageToken, 100);
    all.push(...result.items.filter((f) => f.kind === 'file'));
    pageToken = result.nextPageToken ?? null;
  } while (pageToken);
  return all;
}

/**
 * Snapshot the destination folder into a Set of "name:size" strings.
 * Used for O(1) duplicate-detection before each upload — same approach as rclone.
 * Size is -1 when unknown so names still match when the provider omits sizes.
 */
async function buildDestSet(
  userId: string,
  providerId: string,
  folderId: string | null,
): Promise<Set<string>> {
  try {
    const files = await collectFiles(userId, providerId, folderId);
    return new Set(files.map((f) => destKey(f.name, f.size)));
  } catch {
    // Non-fatal — if we can't list the destination we'll still rely on Redis state
    return new Set();
  }
}

function destKey(name: string, size: number | null): string {
  return `${name}:${size ?? -1}`;
}

// ─── Progress helper ──────────────────────────────────────────────────────────

/** Persist progress + runtime counters in config without a full config read. */
async function patchTask(
  taskId: string,
  progressPct: number,
  configPatch: Record<string, unknown>,
): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from('tasks')
    .select('config')
    .eq('id', taskId)
    .single();

  const newConfig = { ...(row?.config ?? {}), ...configPatch };
  await supabaseAdmin
    .from('tasks')
    .update({ progress: Math.round(progressPct), config: newConfig })
    .eq('id', taskId);
}

// ─── Skip-warning builder ─────────────────────────────────────────────────────

function fileList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= 3) return names.map((n) => `"${n}"`).join(', ');
  return `"${names[0]}", "${names[1]}", "${names[2]}" and ${names.length - 3} more`;
}

function buildWarning(
  byReason: Record<GDriveSkipReason, string[]>,
  hardFailed: string[],
): string | null {
  const parts: string[] = [];

  const restricted = byReason['download_restricted'] ?? [];
  if (restricted.length > 0) {
    parts.push(
      `${restricted.length} file${restricted.length > 1 ? 's' : ''} skipped (download restricted): ${fileList(restricted)}.`,
    );
  }
  const notExportable = byReason['not_exportable'] ?? [];
  if (notExportable.length > 0) {
    parts.push(
      `${notExportable.length} file${notExportable.length > 1 ? 's' : ''} skipped (not exportable): ${fileList(notExportable)}.`,
    );
  }
  if (hardFailed.length > 0) {
    parts.push(
      `${hardFailed.length} file${hardFailed.length > 1 ? 's' : ''} failed after ${MAX_FILE_ATTEMPTS} attempts: ${fileList(hardFailed)}.`,
    );
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

// ─── Core task executor ───────────────────────────────────────────────────────

async function runTask(payload: { taskId: string; userId: string }): Promise<void> {
  const { taskId, userId } = payload;

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error || !task) {
    console.warn(`[jobs-worker] Task ${taskId} not found – skipping`);
    return;
  }

  const cfg  = task.config ?? {};
  const type = task.type as 'copy' | 'move' | 'cleanup' | 'sync';

  // Guard: skip if the task was already resolved (e.g. marked failed by recoverStalledTasks
  // before BullMQ re-queued the stalled BullMQ job).
  if (['failed', 'completed', 'cancelled'].includes(task.status)) {
    console.log(`[jobs-worker] Task ${taskId} is already ${task.status} – skipping BullMQ re-run`);
    return;
  }

  if (!cfg.is_active) {
    console.log(`[jobs-worker] Task ${taskId} is inactive – skipping`);
    return;
  }

  await supabaseAdmin
    .from('tasks')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', taskId);

  const source:      any = cfg.source;
  const destination: any = cfg.destination;
  const startedAt = new Date().toISOString();

  try {
    await checkTransferLimit(userId);

    const plan    = await getUserPlan(userId);
    const threads = PLAN_LIMITS[plan].threads;

    // ── Collect source files ─────────────────────────────────────────────────
    const files = await collectFiles(userId, source.providerId, source.folderId ?? null);
    const total = files.length;

    await patchTask(taskId, 0, {
      total_files:                 total,
      files_processed:             0,
      current_file:                null,
      last_run_at:                 startedAt,
      estimated_seconds_remaining: null,
    });

    console.log(`[jobs-worker] Task ${taskId}: ${total} files, ${threads} thread(s), plan=${plan}`);

    // ── Load idempotency state ────────────────────────────────────────────────
    //
    // doneSet  — file IDs confirmed done in a previous run (Redis, persisted across crashes)
    // destSet  — "name:size" keys of files already in the destination folder
    //
    // Either set matching → skip the file and mark done in Redis.
    // destSet is mutated during the run so parallel copies within the same run
    // also benefit from the check (prevents concurrent-copy duplicates).

    const isTransferType = type === 'copy' || type === 'move' || type === 'sync';

    const [doneSet, destSet] = await Promise.all([
      isTransferType ? loadDoneSet(taskId) : Promise.resolve(new Set<string>()),
      isTransferType
        ? buildDestSet(userId, destination.providerId, destination.folderId ?? null)
        : Promise.resolve(new Set<string>()),
    ]);

    console.log(
      `[jobs-worker] Task ${taskId}: ${doneSet.size} already done (Redis), ${destSet.size} files in destination`,
    );

    const t0 = Date.now();

    // Mutable counters — safe in single-threaded Node.js event loop
    let completed        = 0;
    let skipped          = 0;
    let hardFailed       = 0;
    let bytesTransferred = 0;

    const skippedByReason: Record<GDriveSkipReason, string[]> = {
      download_restricted: [],
      not_exportable:      [],
    };
    const hardFailedNames: string[] = [];

    let lastPatchAt = 0;
    const PATCH_INTERVAL_MS = 2000;

    // ── Per-file processor ───────────────────────────────────────────────────

    async function processFile(file: FileItem): Promise<void> {
      try {
        switch (type) {

          // ── Cleanup (delete) ──────────────────────────────────────────────
          case 'cleanup': {
            await retryWithBackoff(() =>
              deleteProviderFile(userId, source.providerId, file.id, file.path),
            );
            completed++;
            break;
          }

          // ── Copy / Move / Sync ────────────────────────────────────────────
          case 'copy':
          case 'move':
          case 'sync': {

            // 1. Skip if already done in a prior run (Redis)
            if (doneSet.has(file.id)) {
              console.log(`[jobs-worker] Task ${taskId}: skipping "${file.name}" (already done in prior run)`);
              skipped++;
              break;
            }

            // 2. Skip if a file with same name + size already exists in destination
            const dk = destKey(file.name, file.size);
            if (destSet.has(dk)) {
              console.log(`[jobs-worker] Task ${taskId}: skipping "${file.name}" (already in destination)`);
              await markFileDone(taskId, file.id).catch(() => {}); // cache the result
              skipped++;
              break;
            }

            // 3. Stream-copy with retry
            const { bytesTransferred: transferred } = await retryWithBackoff(() =>
              copyProviderFile(
                userId,
                source.providerId, file.id, file.name, file.path ?? null,
                destination.providerId, destination.folderId ?? null,
              ),
            );

            bytesTransferred += transferred;

            // 4. Post-copy: mark done + update dest snapshot so parallel
            //    workers in this same run don't re-copy the same file
            destSet.add(dk);
            doneSet.add(file.id);
            await markFileDone(taskId, file.id).catch(() => {});

            if (type === 'move') {
              // Delete source after confirmed copy — best-effort, not retried
              await deleteProviderFile(userId, source.providerId, file.id, file.path).catch((e) =>
                console.warn(`[jobs-worker] Task ${taskId}: could not delete source "${file.name}" after move:`, e),
              );
            }

            completed++;
            break;
          }
        }
      } catch (fileErr: any) {
        // ── GDrive not-exportable — permanent skip ────────────────────────
        if (fileErr instanceof GDriveNotExportableError || fileErr?.code === 'GDRIVE_NOT_EXPORTABLE') {
          const reason: GDriveSkipReason = fileErr.reason ?? 'not_exportable';
          console.warn(`[jobs-worker] Task ${taskId}: skipping "${file.name}" (${reason})`);
          skippedByReason[reason].push(file.name);
          skipped++;
          return;
        }

        // ── Hard failure after all retries ────────────────────────────────
        console.error(`[jobs-worker] Task ${taskId}: "${file.name}" failed after ${MAX_FILE_ATTEMPTS} attempts:`, fileErr);
        hardFailedNames.push(file.name);
        hardFailed++;

        // Abort entire job if error rate is too high
        const processed = completed + skipped + hardFailed;
        if (processed >= 5 && hardFailed / processed > MAX_FAILURE_RATE) {
          throw new Error(
            `Aborting: ${hardFailed}/${processed} files failed. Last error: ${fileErr?.message}`,
          );
        }
        return; // non-fatal — continue with remaining files
      }

      // ── Throttled progress patch ─────────────────────────────────────────
      const now = Date.now();
      if (now - lastPatchAt >= PATCH_INTERVAL_MS) {
        lastPatchAt = now;
        const done    = completed + skipped + hardFailed;
        const elapsed = (now - t0) / 1000;
        const rate    = done > 0 ? done / elapsed : null;
        const eta     = rate ? Math.round((total - done) / rate) : null;
        await patchTask(taskId, (done / Math.max(total, 1)) * 100, {
          files_processed:             completed,
          current_file:                file.name,
          estimated_seconds_remaining: eta,
        });
      }
    }

    // ── Run concurrently ─────────────────────────────────────────────────────
    const limit = pLimit(threads);
    await Promise.all(files.map((file) => limit(() => processFile(file))));

    // If every transfer-eligible file failed and nothing was transferred, fail
    // the job rather than marking it Done with a warning.  This covers the
    // common case of a single file that fails all retries.
    if (isTransferType && completed === 0 && hardFailed > 0) {
      throw new Error(
        `${hardFailed} file${hardFailed > 1 ? 's' : ''} failed to transfer after ${MAX_FILE_ATTEMPTS} attempts: ${fileList(hardFailedNames)}.`,
      );
    }

    // ── Completion ───────────────────────────────────────────────────────────
    const completedAt = new Date().toISOString();
    const isOnce      = !cfg.schedule || cfg.schedule.frequency === 'once' || cfg.schedule.frequency === 'immediate';

    if (bytesTransferred > 0) {
      await recordTransferUsage(userId, bytesTransferred).catch((e) =>
        console.error(`[jobs-worker] Failed to record transfer usage for task ${taskId}:`, e),
      );
    }

    const warning = buildWarning(skippedByReason, hardFailedNames);

    const completionConfigPatch = {
      files_processed:             completed,
      skipped_files:               skipped,
      failed_files:                hardFailed,
      bytes_transferred:           bytesTransferred,
      warning,
      current_file:                null,
      estimated_seconds_remaining: null,
    };

    if (isOnce) {
      await patchTask(taskId, 100, completionConfigPatch);
      await supabaseAdmin
        .from('tasks')
        .update({ status: 'completed', progress: 100, completed_at: completedAt, bull_job_id: null })
        .eq('id', taskId);
      // One-shot job done — clean up Redis progress record
      await clearTaskProgress(taskId).catch(() => {});
      console.log(
        `[jobs-worker] Task ${taskId} completed` +
        (skipped    ? `, ${skipped} skipped`      : '') +
        (hardFailed ? `, ${hardFailed} failed`    : ''),
      );
    } else {
      const nextRunAt = computeNextRunAt(cfg.schedule);
      const delay     = nextRunAt.getTime() - Date.now();
      const newBullId = await addDelayedJob(taskId, userId, delay);
      const newConfig = {
        ...cfg,
        ...completionConfigPatch,
        next_run_at: nextRunAt.toISOString(),
        last_run_at: completedAt,
        total_files: total,
      };
      await supabaseAdmin
        .from('tasks')
        .update({ status: 'pending', progress: 0, bull_job_id: newBullId, config: newConfig })
        .eq('id', taskId);
      // Keep Redis progress for recurring jobs — next run skips already-done files
      console.log(`[jobs-worker] Task ${taskId} done; next run at ${nextRunAt.toISOString()}`);
    }

  } catch (err: any) {
    console.error(`[jobs-worker] Task ${taskId} failed:`, err);
    await supabaseAdmin
      .from('tasks')
      .update({
        status:        'failed',
        error_message: friendlyError(err),
        completed_at:  new Date().toISOString(),
        bull_job_id:   null,
        config:        { ...cfg, is_active: false },
      })
      .eq('id', taskId);
    // Keep Redis progress so a manual retry can resume from where it left off
  }
}

// ─── Worker registration ──────────────────────────────────────────────────────

let worker: Worker | null = null;

/**
 * On startup, mark any tasks still showing 'running' as failed.
 * Catches tasks interrupted by a previous process crash (OOM, deploy, etc.).
 */
async function recoverStalledTasks(): Promise<void> {
  const { data: stalled } = await supabaseAdmin
    .from('tasks')
    .select('id, config')
    .eq('status', 'running');

  if (!stalled || stalled.length === 0) return;

  console.log(`[jobs-worker] Recovering ${stalled.length} stalled task(s): ${stalled.map((t: any) => t.id).join(', ')}`);

  // Update each task individually so we can merge is_active into the existing config
  await Promise.all(
    stalled.map((t: any) =>
      supabaseAdmin
        .from('tasks')
        .update({
          status:        'failed',
          error_message: 'The worker restarted while this job was running. Retry to resume — already-transferred files will be skipped.',
          completed_at:  new Date().toISOString(),
          bull_job_id:   null,
          // Disable task so BullMQ re-run (stall re-queue) hits the is_active guard
          config:        { ...(t.config ?? {}), is_active: false },
        })
        .eq('id', t.id),
    ),
  );
}

export function startJobsWorker(): void {
  if (worker) return;

  recoverStalledTasks().catch((e) =>
    console.error('[jobs-worker] Stall recovery failed:', e),
  );

  worker = new Worker(
    QUEUE_NAME,
    async (job: BullJob) => {
      console.log(`[jobs-worker] Processing BullMQ job ${job.id} → task ${job.data.taskId}`);
      await runTask(job.data as { taskId: string; userId: string });
    },
    { connection: createRedisConnection(), concurrency: 4 },
  );

  // Fires when BullMQ marks a job failed due to process crash / stall timeout.
  // runTask's own catch handles normal errors; this handles the abnormal path.
  worker.on('failed', async (job, err) => {
    console.error(`[jobs-worker] BullMQ job ${job?.id} failed:`, err);
    if (job?.data?.taskId) {
      await supabaseAdmin
        .from('tasks')
        .update({
          status:        'failed',
          error_message: friendlyError(err),
          completed_at:  new Date().toISOString(),
          bull_job_id:   null,
        })
        .eq('id', job.data.taskId)
        .eq('status', 'running');
    }
  });

  console.log('[jobs-worker] Worker started');
}

export function stopJobsWorker(): Promise<void> {
  return worker ? worker.close() : Promise.resolve();
}
