import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ProviderType =
  | 'google_drive'
  | 'onedrive'
  | 'dropbox'
  | 'mega'
  | 'aws_s3'
  | 'box';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface ProviderInfo {
  email: string;
  displayName: string;
  storageUsed: number;
  storageTotal: number;
}

// ─── State Stores ───────────────────────────────────────────────────────────────

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthStateEntry {
  userId: string;
  providerType: ProviderType;
  createdAt: number;
}

interface TempCredentialEntry {
  providerType: ProviderType;
  credentials: Record<string, string>;
  createdAt: number;
}

const oauthStateStore = new Map<string, OAuthStateEntry>();
const tempCredentialStore = new Map<string, TempCredentialEntry>();

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStateStore) {
    if (now - val.createdAt > STATE_TTL_MS) oauthStateStore.delete(key);
  }
  for (const [key, val] of tempCredentialStore) {
    if (now - val.createdAt > STATE_TTL_MS) tempCredentialStore.delete(key);
  }
}, 5 * 60 * 1000);

export function createOAuthState(userId: string, providerType: ProviderType): string {
  const state = uuidv4();
  oauthStateStore.set(state, { userId, providerType, createdAt: Date.now() });
  return state;
}

export function validateOAuthState(
  state: string,
  userId: string,
): OAuthStateEntry | null {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  if (entry.userId !== userId) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return null;
  }
  oauthStateStore.delete(state); // one-time use
  return entry;
}

export function storeTempCredentials(
  providerType: ProviderType,
  credentials: Record<string, string>,
): string {
  const code = `cred_${uuidv4()}`;
  tempCredentialStore.set(code, { providerType, credentials, createdAt: Date.now() });
  return code;
}

export function retrieveTempCredentials(
  code: string,
): TempCredentialEntry | null {
  const entry = tempCredentialStore.get(code);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    tempCredentialStore.delete(code);
    return null;
  }
  tempCredentialStore.delete(code); // one-time use
  return entry;
}

// ─── Credential-based providers ─────────────────────────────────────────────────

const CREDENTIAL_PROVIDERS: ProviderType[] = ['mega', 'aws_s3'];

export function isCredentialProvider(type: ProviderType): boolean {
  return CREDENTIAL_PROVIDERS.includes(type);
}

// ─── Authorization URL Dispatcher ───────────────────────────────────────────────

export function getAuthorizationUrl(
  providerType: ProviderType,
  redirectUri: string,
  state: string,
  formBaseUrl?: string,
): string {
  switch (providerType) {
    case 'google_drive':
      return googleAuthUrl(redirectUri, state);
    case 'onedrive':
      return oneDriveAuthUrl(redirectUri, state);
    case 'dropbox':
      return dropboxAuthUrl(redirectUri, state);
    case 'box':
      return boxAuthUrl(redirectUri, state);
    case 'mega':
    case 'aws_s3':
      if (!formBaseUrl) throw new Error('formBaseUrl is required for credential providers');
      return `${formBaseUrl}/api/providers/auth-form?provider=${providerType}&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    default:
      throw new Error(`Unsupported provider: ${providerType}`);
  }
}

// ─── Token Exchange Dispatcher ──────────────────────────────────────────────────

export async function exchangeCode(
  providerType: ProviderType,
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  switch (providerType) {
    case 'google_drive':
      return exchangeGoogleCode(code, redirectUri);
    case 'onedrive':
      return exchangeOneDriveCode(code, redirectUri);
    case 'dropbox':
      return exchangeDropboxCode(code, redirectUri);
    case 'box':
      return exchangeBoxCode(code, redirectUri);
    default:
      throw new Error(`Token exchange not supported for ${providerType}`);
  }
}

// ─── User Info Dispatcher ───────────────────────────────────────────────────────

export async function getUserInfo(
  providerType: ProviderType,
  accessToken: string,
): Promise<{ email: string; displayName: string }> {
  switch (providerType) {
    case 'google_drive':
      return getGoogleUserInfo(accessToken);
    case 'onedrive':
      return getOneDriveUserInfo(accessToken);
    case 'dropbox':
      return getDropboxUserInfo(accessToken);
    case 'box':
      return getBoxUserInfo(accessToken);
    default:
      throw new Error(`User info not supported for ${providerType}`);
  }
}

// ─── Storage Quota Dispatcher ───────────────────────────────────────────────────

export async function getStorageQuota(
  providerType: ProviderType,
  accessToken: string,
): Promise<{ used: number; total: number }> {
  switch (providerType) {
    case 'google_drive':
      return getGoogleStorage(accessToken);
    case 'onedrive':
      return getOneDriveStorage(accessToken);
    case 'dropbox':
      return getDropboxStorage(accessToken);
    case 'box':
      return getBoxStorage(accessToken);
    default:
      throw new Error(`Storage quota not supported for ${providerType}`);
  }
}

// ─── Token Revocation Dispatcher ────────────────────────────────────────────────

export async function revokeTokens(
  providerType: ProviderType,
  credentials: Record<string, any>,
): Promise<void> {
  try {
    switch (providerType) {
      case 'google_drive':
        await revokeGoogleToken(credentials.access_token);
        break;
      case 'onedrive':
        // Microsoft doesn't provide a simple token revoke endpoint
        break;
      case 'dropbox':
        await revokeDropboxToken(credentials.access_token);
        break;
      case 'box':
        await revokeBoxToken(credentials.access_token);
        break;
      case 'mega':
      case 'aws_s3':
        // Credential-based — no tokens to revoke
        break;
    }
  } catch {
    // Best-effort revocation — silently ignore errors
  }
}

// ─── Credential Validation (MEGA & S3) ──────────────────────────────────────────

export async function validateMegaCredentials(
  email: string,
  password: string,
): Promise<ProviderInfo> {
  try {
    const megajs = require('megajs');
    const Storage = megajs.Storage || megajs.default?.Storage || megajs;

    return await new Promise<ProviderInfo>((resolve, reject) => {
      const storage = new Storage(
        { email, password, autologin: true, autoload: true },
        (err: Error | null) => {
          if (err) return reject(new Error('Invalid MEGA credentials'));

          const spaceUsed = (storage as any).state?.usedStorage || 0;
          const spaceTotal = 20 * 1024 * 1024 * 1024; // MEGA free tier = 20 GB

          try {
            storage.close();
          } catch {
            /* ignore */
          }

          resolve({
            email,
            displayName: `MEGA (${email})`,
            storageUsed: spaceUsed,
            storageTotal: spaceTotal,
          });
        },
      );

      // Timeout after 15 seconds
      setTimeout(() => reject(new Error('MEGA login timeout')), 15_000);
    });
  } catch (err: any) {
    throw new Error(err?.message || 'Invalid MEGA credentials');
  }
}

export async function validateS3Credentials(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  bucket?: string,
): Promise<ProviderInfo> {
  try {
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({ accessKeyId, secretAccessKey, region });

    // Verify by listing buckets
    const result = await s3.listBuckets().promise();
    const bucketCount = result.Buckets?.length || 0;

    return {
      email: `${bucketCount} bucket${bucketCount !== 1 ? 's' : ''} • ${region}`,
      displayName: bucket ? `S3 (${bucket})` : `AWS S3 (${region})`,
      storageUsed: 0,
      storageTotal: 0, // S3 has no storage limit concept
    };
  } catch (err: any) {
    throw new Error(err?.message || 'Invalid AWS credentials');
  }
}

// ═════════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE
// ═════════════════════════════════════════════════════════════════════════════════

function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Google token exchange failed: ${body}`);
  }
  return resp.json() as Promise<OAuthTokens>;
}

async function getGoogleUserInfo(
  accessToken: string,
): Promise<{ email: string; displayName: string }> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to get Google user info');
  const data: any = await resp.json();
  return { email: data.email, displayName: data.name || data.email };
}

async function getGoogleStorage(
  accessToken: string,
): Promise<{ used: number; total: number }> {
  const resp = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error('Failed to get Google storage');
  const data: any = await resp.json();
  return {
    used: parseInt(data.storageQuota?.usage || '0', 10),
    total: parseInt(data.storageQuota?.limit || '0', 10),
  };
}

async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: 'POST',
  });
}

// ═════════════════════════════════════════════════════════════════════════════════
// ONEDRIVE
// ═════════════════════════════════════════════════════════════════════════════════

function oneDriveAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'Files.ReadWrite User.Read offline_access',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

async function exchangeOneDriveCode(
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const resp = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    },
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OneDrive token exchange failed: ${body}`);
  }
  return resp.json() as Promise<OAuthTokens>;
}

async function getOneDriveUserInfo(
  accessToken: string,
): Promise<{ email: string; displayName: string }> {
  const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to get OneDrive user info');
  const data: any = await resp.json();
  return {
    email: data.mail || data.userPrincipalName || '',
    displayName: data.displayName || data.mail || 'OneDrive User',
  };
}

async function getOneDriveStorage(
  accessToken: string,
): Promise<{ used: number; total: number }> {
  const resp = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to get OneDrive storage');
  const data: any = await resp.json();
  return {
    used: data.quota?.used || 0,
    total: data.quota?.total || 0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════
// DROPBOX
// ═════════════════════════════════════════════════════════════════════════════════

function dropboxAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.DROPBOX_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    token_access_type: 'offline',
  });
  return `https://www.dropbox.com/oauth2/authorize?${params}`;
}

async function exchangeDropboxCode(
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.DROPBOX_CLIENT_ID,
      client_secret: env.DROPBOX_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Dropbox token exchange failed: ${body}`);
  }
  return resp.json() as Promise<OAuthTokens>;
}

async function getDropboxUserInfo(
  accessToken: string,
): Promise<{ email: string; displayName: string }> {
  const resp = await fetch(
    'https://api.dropboxapi.com/2/users/get_current_account',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!resp.ok) throw new Error('Failed to get Dropbox user info');
  const data: any = await resp.json();
  return {
    email: data.email || '',
    displayName: data.name?.display_name || data.email || 'Dropbox User',
  };
}

async function getDropboxStorage(
  accessToken: string,
): Promise<{ used: number; total: number }> {
  const resp = await fetch(
    'https://api.dropboxapi.com/2/users/get_space_usage',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!resp.ok) throw new Error('Failed to get Dropbox storage');
  const data: any = await resp.json();
  return {
    used: data.used || 0,
    total: data.allocation?.allocated || 0,
  };
}

async function revokeDropboxToken(token: string): Promise<void> {
  await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ═════════════════════════════════════════════════════════════════════════════════
// BOX
// ═════════════════════════════════════════════════════════════════════════════════

function boxAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.BOX_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  return `https://account.box.com/api/oauth2/authorize?${params}`;
}

async function exchangeBoxCode(
  code: string,
  _redirectUri: string,
): Promise<OAuthTokens> {
  const resp = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.BOX_CLIENT_ID,
      client_secret: env.BOX_CLIENT_SECRET,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Box token exchange failed: ${body}`);
  }
  return resp.json() as Promise<OAuthTokens>;
}

async function getBoxUserInfo(
  accessToken: string,
): Promise<{ email: string; displayName: string }> {
  const resp = await fetch('https://api.box.com/2.0/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to get Box user info');
  const data: any = await resp.json();
  return {
    email: data.login || '',
    displayName: data.name || data.login || 'Box User',
  };
}

async function getBoxStorage(
  accessToken: string,
): Promise<{ used: number; total: number }> {
  const resp = await fetch(
    'https://api.box.com/2.0/users/me?fields=space_amount,space_used',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error('Failed to get Box storage');
  const data: any = await resp.json();
  return {
    used: data.space_used || 0,
    total: data.space_amount || 0,
  };
}

async function revokeBoxToken(accessToken: string): Promise<void> {
  await fetch('https://api.box.com/oauth2/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: accessToken,
      client_id: env.BOX_CLIENT_ID,
      client_secret: env.BOX_CLIENT_SECRET,
    }),
  });
}
