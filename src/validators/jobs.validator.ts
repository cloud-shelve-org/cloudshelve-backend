import { z } from 'zod';

const jobLocationSchema = z.object({
  providerId:    z.string(),
  providerType:  z.string(),
  providerName:  z.string(),
  providerEmail: z.string().optional(),
  folderId:      z.string().nullable(),
  folderPath:    z.string(),
  folderName:    z.string(),
});

const scheduleSchema = z.object({
  frequency:     z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']),
  time:          z.string().regex(/^\d{2}:\d{2}$/),
  date:          z.string().optional(),
  dayOfWeek:     z.number().int().min(0).max(6).optional(),
  dayOfMonth:    z.number().int().min(1).max(31).optional(),
  monthInterval: z.number().int().min(1).max(12).optional(),
});

export const createJobSchema = z.object({
  type:        z.enum(['copy', 'move', 'delete']),
  name:        z.string().min(1).max(255),
  source:      jobLocationSchema,
  destination: jobLocationSchema.optional(),
  schedule:    scheduleSchema,
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
