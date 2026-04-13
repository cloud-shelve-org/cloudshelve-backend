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
  downloadProviderFile,
  uploadProviderFile,
  deleteProviderFile,
} from '../services/files.service';
import { GDriveNotExportableError, type GDriveSkipReason } from '../services/files-adapters';
import type { FileItem } from '../services/files-adapters';

// ─── Error humanisation ───────────────────────────────────────────────────────

function friendlyError(err: any): string {
  const msg: string = err?.message ?? '';

  if (msg.includes('Google Drive')) {
    if (msg.includes('401')) return 'Google Drive: Session expired. Reconnect your Google Drive account and try again.';
    if (msg.includes('403')) return 'Google Drive: Access denied. Make sure the app still has permission to access this folder.';
    if (msg.includes('404')) return 'Google Drive: File or folder not found. It may have been moved or deleted.';
    if (msg.includes('export failed')) return 'Google Drive: Could not export this file type. Only Docs, Sheets, Slides, and Drawings are exportable.';
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

  // Return raw message only if it looks user-safe (no HTTP codes / stack info)
  if (msg && !msg.match(/^\s*Error:/i) && msg.length < 200) return msg;
  return 'An unexpected error occurred. Please try again or contact support.';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= 3) return names.map((n) => `"${n}"`).join(', ');
  return `"${names[0]}", "${names[1]}", "${names[2]}" and ${names.length - 3} more`;
}

function buildSkipWarning(byReason: Record<string, string[]>): string | null {
  const parts: string[] = [];

  const restricted = byReason['download_restricted'] ?? [];
  if (restricted.length > 0) {
    parts.push(
      `${restricted.length} file${restricted.length > 1 ? 's' : ''} could not be copied because they are shared with download restrictions: ${fileList(restricted)}.`,
    );
  }

  const notExportable = byReason['not_exportable'] ?? [];
  if (notExportable.length > 0) {
    parts.push(
      `${notExportable.length} file${notExportable.length > 1 ? 's' : ''} were skipped because Google Drive does not support exporting their file type: ${fileList(notExportable)}.`,
    );
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

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

  // Guard: task may have been deactivated between scheduling and execution
  if (!cfg.is_active) {
    console.log(`[jobs-worker] Task ${taskId} is inactive – skipping`);
    return;
  }

  // Mark running
  await supabaseAdmin
    .from('tasks')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', taskId);

  const source:      any = cfg.source;
  const destination: any = cfg.destination;
  const startedAt = new Date().toISOString();

  try {
    // Block if the user has already exhausted their monthly transfer allowance
    await checkTransferLimit(userId);

    // Resolve thread count from the user's plan
    const plan    = await getUserPlan(userId);
    const threads = PLAN_LIMITS[plan].threads;

    const files = await collectFiles(userId, source.providerId, source.folderId ?? null);
    const total = files.length;

    await patchTask(taskId, 0, {
      total_files:                 total,
      files_processed:             0,
      current_file:                null,
      last_run_at:                 startedAt,
      estimated_seconds_remaining: null,
    });

    console.log(`[jobs-worker] Task ${taskId}: processing ${total} files with ${threads} thread(s) (plan: ${plan})`);

    const t0 = Date.now();

    // Mutable counters — safe in single-threaded Node.js
    let completed        = 0;
    let skipped          = 0;
    let bytesTransferred = 0;
    const skippedByReason: Record<GDriveSkipReason, string[]> = {
      download_restricted: [],
      not_exportable:      [],
    };

    // Throttle DB progress writes to avoid hammering Supabase
    let lastPatchAt = 0;
    const PATCH_INTERVAL_MS = 2000;

    async function processFile(file: FileItem): Promise<void> {
      try {
        switch (type) {
          case 'cleanup': {
            await deleteProviderFile(userId, source.providerId, file.id, file.path);
            break;
          }
          case 'copy':
          case 'move':
          case 'sync': {
            const { buffer, contentType, fileName: exportedName } = await downloadProviderFile(
              userId,
              source.providerId,
              file.id,
              file.name,
              file.path,
            );
            bytesTransferred += buffer.byteLength;
            await uploadProviderFile(
              userId,
              destination.providerId,
              destination.folderId ?? null,
              exportedName,
              contentType || file.mimeType || 'application/octet-stream',
              buffer,
            );
            if (type === 'move') {
              await deleteProviderFile(userId, source.providerId, file.id, file.path);
            }
            break;
          }
        }
        completed++;
      } catch (fileErr: any) {
        if (fileErr instanceof GDriveNotExportableError || fileErr?.code === 'GDRIVE_NOT_EXPORTABLE') {
          const reason: GDriveSkipReason = fileErr.reason ?? 'not_exportable';
          console.warn(`[jobs-worker] Task ${taskId}: skipping "${file.name}" (${reason})`);
          skippedByReason[reason].push(file.name);
          skipped++;
          return; // non-fatal
        }
        throw fileErr; // fatal — propagates out of Promise.all
      }

      // Throttled progress update (check+set is synchronous → no race in Node.js)
      const now = Date.now();
      if (now - lastPatchAt >= PATCH_INTERVAL_MS) {
        lastPatchAt = now;
        const done    = completed + skipped;
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

    // Run files concurrently up to `threads` at a time
    const limit = pLimit(threads);
    await Promise.all(files.map((file) => limit(() => processFile(file))));

    const completedAt = new Date().toISOString();
    const isOnce      = !cfg.schedule || cfg.schedule.frequency === 'once' || cfg.schedule.frequency === 'immediate';

    // Build a human-readable warning if any files were skipped
    const warning = buildSkipWarning(skippedByReason);

    // Record transfer usage atomically (fire-and-forget errors — non-critical)
    if (bytesTransferred > 0) {
      await recordTransferUsage(userId, bytesTransferred).catch((e) =>
        console.error(`[jobs-worker] Failed to record transfer usage for task ${taskId}:`, e),
      );
    }

    const completionConfigPatch = {
      files_processed:             completed,
      skipped_files:               skipped,
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
      console.log(`[jobs-worker] Task ${taskId} completed (once)${skipped ? `, ${skipped} skipped` : ''}`);
    } else {
      // Recurring: reset and schedule next run
      const nextRunAt  = computeNextRunAt(cfg.schedule);
      const delay      = nextRunAt.getTime() - Date.now();
      const newBullId  = await addDelayedJob(taskId, userId, delay);
      const newConfig  = {
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
      console.log(`[jobs-worker] Task ${taskId} done; next run at ${nextRunAt.toISOString()}${skipped ? `, ${skipped} skipped` : ''}`);
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
  }
}

// ─── Worker registration ──────────────────────────────────────────────────────

let worker: Worker | null = null;

export function startJobsWorker(): void {
  if (worker) return; // already started

  worker = new Worker(
    QUEUE_NAME,
    async (job: BullJob) => {
      console.log(`[jobs-worker] Processing BullMQ job ${job.id} → task ${job.data.taskId}`);
      await runTask(job.data as { taskId: string; userId: string });
    },
    { connection: createRedisConnection(), concurrency: 4 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[jobs-worker] BullMQ job ${job?.id} failed:`, err);
  });

  console.log('[jobs-worker] Worker started');
}

export function stopJobsWorker(): Promise<void> {
  return worker ? worker.close() : Promise.resolve();
}
