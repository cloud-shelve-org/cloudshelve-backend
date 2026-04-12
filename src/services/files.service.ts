import { supabaseAdmin } from '../config/supabase';
import { decryptCredentials, encryptCredentials } from '../lib/credentials-crypto';
import { refreshAccessToken, type OAuthTokens, type ProviderType, isCredentialProvider } from './provider-adapters';
import {
  listFiles as adapterListFiles,
  searchFiles as adapterSearchFiles,
  createFolder as adapterCreateFolder,
  deleteFile as adapterDeleteFile,
  renameFile as adapterRenameFile,
  uploadFile as adapterUploadFile,
  downloadFile as adapterDownloadFile,
} from './files-adapters';

const DB_TYPE_TO_API: Record<string, ProviderType> = {
  gdrive: 'google_drive',
  s3: 'aws_s3',
};

function mapDbType(dbType: string): ProviderType {
  return (DB_TYPE_TO_API[dbType] || dbType) as ProviderType;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;

// ─── Internal: resolve a valid access token (with silent refresh) ─────────────

async function resolveAccessToken(
  userId: string,
  providerId: string,
): Promise<{ accessToken: string; providerType: ProviderType }> {
  const { data: row, error } = await supabaseAdmin
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('user_id', userId)
    .single();

  if (error || !row) {
    const err: any = new Error('Provider not found');
    err.statusCode = 404;
    throw err;
  }

  const providerType = mapDbType(row.type);
  const credentials = decryptCredentials(row.credentials);

  // Credential-based providers (MEGA, AWS S3) don't use OAuth tokens.
  // Pass the raw credentials as a JSON string so the file adapter can use them.
  if (isCredentialProvider(providerType)) {
    return { accessToken: JSON.stringify(credentials), providerType };
  }

  const { access_token, refresh_token, expires_at } = credentials as OAuthTokens;

  if (!access_token) {
    const err: any = new Error('No access token. Please reconnect the provider.');
    err.statusCode = 401;
    throw err;
  }

  if (!expires_at || Date.now() < expires_at - REFRESH_BUFFER_MS) {
    return { accessToken: access_token, providerType };
  }

  if (!refresh_token) {
    const err: any = new Error('Access token expired. Please reconnect the provider.');
    err.statusCode = 401;
    throw err;
  }

  const newTokens: OAuthTokens = {
    ...credentials,
    ...(await refreshAccessToken(providerType, refresh_token)),
  };
  newTokens.expires_at = newTokens.expires_in
    ? Date.now() + newTokens.expires_in * 1000
    : undefined;
  newTokens.refresh_token = newTokens.refresh_token ?? refresh_token;

  await supabaseAdmin
    .from('providers')
    .update({ credentials: encryptCredentials(newTokens) })
    .eq('id', providerId)
    .eq('user_id', userId);

  return { accessToken: newTokens.access_token, providerType };
}

// ─── Public service functions ─────────────────────────────────────────────────

export async function listProviderFiles(
  userId: string,
  providerId: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterListFiles(providerType, accessToken, folderId, pageToken, pageSize);
}

export async function searchProviderFiles(
  userId: string,
  providerId: string,
  query: string,
  pageToken: string | null,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterSearchFiles(providerType, accessToken, query, pageToken, pageSize);
}

export async function createProviderFolder(
  userId: string,
  providerId: string,
  parentId: string | null,
  name: string,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterCreateFolder(providerType, accessToken, parentId, name);
}

export async function deleteProviderFile(
  userId: string,
  providerId: string,
  fileId: string,
  filePath?: string | null,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterDeleteFile(providerType, accessToken, fileId, filePath);
}

export async function renameProviderFile(
  userId: string,
  providerId: string,
  fileId: string,
  newName: string,
  filePath?: string | null,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterRenameFile(providerType, accessToken, fileId, newName, filePath);
}

export async function uploadProviderFile(
  userId: string,
  providerId: string,
  parentId: string | null,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterUploadFile(providerType, accessToken, parentId, fileName, mimeType, buffer);
}

export async function downloadProviderFile(
  userId: string,
  providerId: string,
  fileId: string,
  fileName: string,
  filePath?: string | null,
) {
  const { accessToken, providerType } = await resolveAccessToken(userId, providerId);
  return adapterDownloadFile(providerType, accessToken, fileId, fileName, filePath);
}
