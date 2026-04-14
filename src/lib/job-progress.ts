/**
 * Per-file progress tracking for background jobs.
 *
 * Uses a Redis Hash to record which source files have been successfully
 * transferred. This lets the worker skip already-copied files when a job
 * is retried or resumed after a crash — exactly how Dropbox / rclone handle it.
 *
 * Key schema:  task_progress:{taskId}
 * Field:       {sourceFileId}
 * Value:       "done"
 *
 * TTL: 30 days — long enough to cover any realistic retry window.
 */

import IORedis from 'ioredis';
import { createRedisConnection } from '../config/redis';

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

let _redis: IORedis | null = null;

function redis(): IORedis {
  if (!_redis) _redis = createRedisConnection();
  return _redis;
}

function progressKey(taskId: string): string {
  return `task_progress:${taskId}`;
}

/** Mark a source file as successfully transferred for this task run. */
export async function markFileDone(taskId: string, fileId: string): Promise<void> {
  const r = redis();
  await r.hset(progressKey(taskId), fileId, 'done');
  await r.expire(progressKey(taskId), TTL_SECONDS);
}

/** Returns true if this file has already been successfully copied in a prior run. */
export async function isFileDone(taskId: string, fileId: string): Promise<boolean> {
  return (await redis().hget(progressKey(taskId), fileId)) === 'done';
}

/** Returns the set of all file IDs already marked done (for bulk pre-check). */
export async function loadDoneSet(taskId: string): Promise<Set<string>> {
  const all = await redis().hgetall(progressKey(taskId));
  return new Set(
    Object.entries(all ?? {})
      .filter(([, v]) => v === 'done')
      .map(([k]) => k),
  );
}

/**
 * Remove the progress record for a task.
 * Call this when a one-shot job completes successfully — keeps Redis tidy.
 * Leave it for recurring jobs so the next run can still skip already-done files.
 */
export async function clearTaskProgress(taskId: string): Promise<void> {
  await redis().del(progressKey(taskId));
}
