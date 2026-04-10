import { z } from 'zod';

export const providerTypes = [
  'google_drive',
  'onedrive',
  'dropbox',
  'mega',
  'aws_s3',
  'box',
] as const;

const providerTypeSchema = z.enum(providerTypes, {
  error: `provider must be one of: ${providerTypes.join(', ')}`,
});

export const oauthUrlQuerySchema = z.object({
  provider: providerTypeSchema,
});

export const connectProviderSchema = z.object({
  provider_type: providerTypeSchema,
  authorization_code: z.string().min(1, 'authorization_code is required'),
  state: z.string().min(1, 'state is required'),
  redirect_uri: z.string().min(1, 'redirect_uri is required'),
});
