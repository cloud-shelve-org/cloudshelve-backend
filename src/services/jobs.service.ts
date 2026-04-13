import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import dayjsTimezone from 'dayjs/plugin/timezone';
import { supabaseAdmin } from '../config/supabase';
import { addDelayedJob, removeJobById } from '../config/queue';
import type { CreateJobInput } from '../validators/jobs.validator';

dayjs.extend(utc);
dayjs.extend(dayjsTimezone);

// ─── Type helpers ─────────────────────────────────────────────────────────────

function frontendTypeToDB(type: string): string {
  return type === 'delete' ? 'cleanup' : type;
}

function dbTypeToFrontend(type: string): string {
  return type === 'cleanup' ? 'delete' : type;
}

function dbRowToJob(row: any): any {
  const cfg    = row.config ?? {};
  const status = row.status === 'pending'
    ? (cfg.is_active ? 'active' : 'inactive')
    : row.status;

  return {
    id:                         row.id,
    type:                       dbTypeToFrontend(row.type),
    name:                       cfg.name ?? '',
    status,
    source:                     cfg.source     ?? null,
    destination:                cfg.destination ?? null,
    schedule:                   cfg.schedule    ?? null,
    nextRunAt:                  cfg.next_run_at ?? null,
    lastRunAt:                  cfg.last_run_at ?? null,
    progress:                   (row.progress ?? 0) / 100,
    filesProcessed:             cfg.files_processed             ?? null,
    totalFiles:                 cfg.total_files                 ?? null,
    skippedFiles:               cfg.skipped_files               ?? null,
    currentFile:                cfg.current_file                ?? null,
    estimatedSecondsRemaining:  cfg.estimated_seconds_remaining ?? null,
    createdAt:                  row.created_at,
    updatedAt:                  row.updated_at,
    error:                      row.error_message ?? null,
    warning:                    cfg.warning                     ?? null,
  };
}

// ─── computeNextRunAt (timezone-aware via dayjs) ──────────────────────────────

export function computeNextRunAt(schedule: any): Date {
  if (schedule.frequency === 'immediate') return new Date();

  const tz = schedule.timezone || 'UTC';
  const [hh, mm] = (schedule.time as string).split(':').map(Number);

  // Helper: set the scheduled HH:MM on a dayjs-in-tz instance
  const atTime = (d: dayjs.Dayjs) =>
    d.tz(tz).hour(hh).minute(mm).second(0).millisecond(0);

  const nowInTz = dayjs().tz(tz);
  let candidate: dayjs.Dayjs;

  switch (schedule.frequency) {
    case 'immediate': {
      return new Date();
    }
    case 'once': {
      if (!schedule.date) throw new Error("'once' schedule requires a date");
      candidate = dayjs.tz(
        `${schedule.date} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`,
        tz,
      );
      break;
    }
    case 'daily': {
      candidate = atTime(nowInTz);
      if (!candidate.isAfter(nowInTz)) candidate = candidate.add(1, 'day');
      break;
    }
    case 'weekly': {
      const dow = schedule.dayOfWeek ?? 1;
      candidate = atTime(nowInTz.add(1, 'day')); // safe default
      for (let i = 1; i <= 7; i++) {
        const d = atTime(nowInTz.add(i, 'day'));
        if (d.day() === dow) { candidate = d; break; }
      }
      break;
    }
    case 'monthly': {
      const dom = schedule.dayOfMonth ?? 1;
      candidate = atTime(nowInTz).date(dom);
      if (!candidate.isAfter(nowInTz)) candidate = candidate.add(1, 'month');
      break;
    }
    case 'custom': {
      const dom      = schedule.dayOfMonth  ?? 1;
      const interval = schedule.monthInterval ?? 1;
      candidate = atTime(nowInTz).date(dom);
      while (!candidate.isAfter(nowInTz)) candidate = candidate.add(interval, 'month');
      break;
    }
    default:
      throw new Error(`Unknown schedule frequency: ${schedule.frequency}`);
  }

  return candidate.toDate();
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listJobs(userId: string): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(dbRowToJob);
}

export async function createJob(userId: string, input: CreateJobInput): Promise<any> {
  const nextRunAt = computeNextRunAt(input.schedule);
  const dbType    = frontendTypeToDB(input.type);

  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      user_id:            userId,
      type:               dbType,
      status:             'pending',
      source_provider_id: input.source.providerId,
      target_provider_id: input.destination?.providerId ?? null,
      source_path:        input.source.folderPath,
      target_path:        input.destination?.folderPath ?? null,
      config: {
        name:                        input.name,
        is_active:                   true,
        schedule:                    input.schedule,
        source:                      input.source,
        destination:                 input.destination ?? null,
        next_run_at:                 nextRunAt.toISOString(),
        last_run_at:                 null,
        files_processed:             0,
        total_files:                 0,
        current_file:                null,
        estimated_seconds_remaining: null,
      },
    })
    .select()
    .single();

  if (error || !row) throw error ?? new Error('Failed to create job');

  // Schedule the first BullMQ delayed execution
  const delay     = nextRunAt.getTime() - Date.now();
  const bullJobId = await addDelayedJob(row.id, userId, delay);

  await supabaseAdmin
    .from('tasks')
    .update({ bull_job_id: bullJobId })
    .eq('id', row.id);

  return dbRowToJob({ ...row, bull_job_id: bullJobId });
}

export async function toggleJob(userId: string, taskId: string): Promise<any> {
  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !row) {
    const err: any = new Error('Job not found');
    err.statusCode  = 404;
    throw err;
  }

  const cfg             = row.config ?? {};
  const isActiveInDB    = row.status === 'pending' && cfg.is_active;

  if (isActiveInDB) {
    // Deactivate: pull the BullMQ job
    if (row.bull_job_id) await removeJobById(row.bull_job_id).catch(() => {});
    const newConfig = { ...cfg, is_active: false };
    await supabaseAdmin
      .from('tasks')
      .update({ bull_job_id: null, config: newConfig })
      .eq('id', taskId);
    return dbRowToJob({ ...row, bull_job_id: null, config: newConfig });
  }

  if (row.status === 'pending' && !cfg.is_active) {
    // Reactivate: compute next run and schedule
    const nextRunAt  = computeNextRunAt(cfg.schedule);
    const delay      = nextRunAt.getTime() - Date.now();
    const bullJobId  = await addDelayedJob(taskId, userId, delay);
    const newConfig  = { ...cfg, is_active: true, next_run_at: nextRunAt.toISOString() };
    await supabaseAdmin
      .from('tasks')
      .update({ bull_job_id: bullJobId, config: newConfig })
      .eq('id', taskId);
    return dbRowToJob({ ...row, bull_job_id: bullJobId, config: newConfig });
  }

  return dbRowToJob(row);
}

export async function cancelJob(userId: string, taskId: string): Promise<any> {
  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !row) {
    const err: any = new Error('Job not found');
    err.statusCode  = 404;
    throw err;
  }

  if (row.bull_job_id) await removeJobById(row.bull_job_id).catch(() => {});

  await supabaseAdmin
    .from('tasks')
    .update({ status: 'cancelled', bull_job_id: null })
    .eq('id', taskId);

  return dbRowToJob({ ...row, status: 'cancelled', bull_job_id: null });
}

export async function deleteJob(userId: string, taskId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .select('id, bull_job_id')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !row) {
    const err: any = new Error('Job not found');
    err.statusCode  = 404;
    throw err;
  }

  if (row.bull_job_id) await removeJobById(row.bull_job_id).catch(() => {});

  await supabaseAdmin.from('tasks').delete().eq('id', taskId);
}

export async function retryJob(userId: string, taskId: string): Promise<any> {
  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error || !row) {
    const err: any = new Error('Job not found');
    err.statusCode  = 404;
    throw err;
  }

  if (row.status !== 'failed' && row.status !== 'cancelled') {
    const err: any = new Error('Only failed or cancelled jobs can be retried');
    err.statusCode  = 400;
    throw err;
  }

  const cfg       = row.config ?? {};
  const isImmediate = !cfg.schedule || cfg.schedule.frequency === 'immediate';
  const nextRunAt   = isImmediate ? new Date() : computeNextRunAt(cfg.schedule);
  const delay       = Math.max(0, nextRunAt.getTime() - Date.now());
  const bullJobId   = await addDelayedJob(taskId, userId, delay);

  const newConfig = {
    ...cfg,
    is_active:    true,
    error_message: null,
    ...(isImmediate ? {} : { next_run_at: nextRunAt.toISOString() }),
  };

  await supabaseAdmin
    .from('tasks')
    .update({
      status:        'pending',
      error_message: null,
      bull_job_id:   bullJobId,
      config:        newConfig,
    })
    .eq('id', taskId);

  return dbRowToJob({ ...row, status: 'pending', error_message: null, bull_job_id: bullJobId, config: newConfig });
}

export async function clearCompletedJobs(userId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from('tasks')
    .select('id, bull_job_id')
    .eq('user_id', userId)
    .in('status', ['completed', 'failed', 'cancelled']);

  for (const row of rows ?? []) {
    if (row.bull_job_id) await removeJobById(row.bull_job_id).catch(() => {});
  }

  await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('user_id', userId)
    .in('status', ['completed', 'failed', 'cancelled']);
}
