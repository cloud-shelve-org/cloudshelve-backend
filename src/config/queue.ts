import { Queue } from 'bullmq';
import { createRedisConnection } from './redis';

export const QUEUE_NAME = 'cloudshelve-jobs';

export const jobQueue = new Queue(QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 100 },
    attempts: 1,
  },
});

/**
 * Schedule a delayed BullMQ job for a DB task.
 * Returns the BullMQ job id.
 */
export async function addDelayedJob(
  taskId: string,
  userId: string,
  delay: number,
): Promise<string> {
  const job = await jobQueue.add(
    'run-task',
    { taskId, userId },
    {
      delay:  Math.max(0, delay),
      jobId:  `task-${taskId}-${Date.now()}`,
    },
  );
  return job.id!;
}

/** Remove a BullMQ job by its id (best-effort). */
export async function removeJobById(bullJobId: string): Promise<void> {
  const job = await jobQueue.getJob(bullJobId);
  if (job) await job.remove();
}
