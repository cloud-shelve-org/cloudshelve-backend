import { Worker, Job as BullJob } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { QUEUE_NAME, addDelayedJob } from '../config/queue';
import { supabaseAdmin } from '../config/supabase';
import { computeNextRunAt } from '../services/jobs.service';
import {
  listProviderFiles,
  downloadProviderFile,
  uploadProviderFile,
  deleteProviderFile,
} from '../services/files.service';
import type { FileItem } from '../services/files-adapters';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const files = await collectFiles(userId, source.providerId, source.folderId ?? null);
    const total = files.length;

    await patchTask(taskId, 0, {
      total_files:                 total,
      files_processed:             0,
      current_file:                null,
      last_run_at:                 startedAt,
      estimated_seconds_remaining: null,
    });

    const t0 = Date.now();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Rolling ETA
      const elapsed = (Date.now() - t0) / 1000;
      const rate    = i > 0 ? i / elapsed : null;
      const eta     = rate ? Math.round((total - i) / rate) : null;

      await patchTask(taskId, (i / Math.max(total, 1)) * 100, {
        files_processed:             i,
        current_file:                file.name,
        estimated_seconds_remaining: eta,
      });

      switch (type) {
        case 'cleanup': {
          await deleteProviderFile(userId, source.providerId, file.id, file.path);
          break;
        }

        case 'copy':
        case 'move':
        case 'sync': {
          const { buffer, contentType } = await downloadProviderFile(
            userId,
            source.providerId,
            file.id,
            file.name,
            file.path,
          );
          await uploadProviderFile(
            userId,
            destination.providerId,
            destination.folderId ?? null,
            file.name,
            contentType || file.mimeType || 'application/octet-stream',
            buffer,
          );
          if (type === 'move') {
            await deleteProviderFile(userId, source.providerId, file.id, file.path);
          }
          break;
        }
      }
    }

    const completedAt = new Date().toISOString();
    const isOnce      = cfg.schedule?.frequency === 'once';

    if (isOnce) {
      await patchTask(taskId, 100, {
        files_processed:             total,
        current_file:                null,
        estimated_seconds_remaining: null,
      });
      await supabaseAdmin
        .from('tasks')
        .update({ status: 'completed', progress: 100, completed_at: completedAt, bull_job_id: null })
        .eq('id', taskId);
      console.log(`[jobs-worker] Task ${taskId} completed (once)`);
    } else {
      // Recurring: reset and schedule next run
      const nextRunAt  = computeNextRunAt(cfg.schedule);
      const delay      = nextRunAt.getTime() - Date.now();
      const newBullId  = await addDelayedJob(taskId, userId, delay);
      const newConfig  = {
        ...cfg,
        next_run_at:                 nextRunAt.toISOString(),
        last_run_at:                 completedAt,
        files_processed:             total,
        total_files:                 total,
        current_file:                null,
        estimated_seconds_remaining: null,
      };
      await supabaseAdmin
        .from('tasks')
        .update({ status: 'pending', progress: 0, bull_job_id: newBullId, config: newConfig })
        .eq('id', taskId);
      console.log(`[jobs-worker] Task ${taskId} done; next run at ${nextRunAt.toISOString()}`);
    }
  } catch (err: any) {
    console.error(`[jobs-worker] Task ${taskId} failed:`, err);
    await supabaseAdmin
      .from('tasks')
      .update({
        status:        'failed',
        error_message: err?.message ?? 'Unknown error',
        completed_at:  new Date().toISOString(),
        bull_job_id:   null,
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
