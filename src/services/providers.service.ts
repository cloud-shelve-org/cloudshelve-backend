import { supabaseAdmin } from '../config/supabase';
import { encryptCredentials, decryptCredentials } from '../lib/credentials-crypto';
import {
  getAuthorizationUrl,
  exchangeCode,
  getUserInfo,
  getStorageQuota,
  revokeTokens,
  refreshAccessToken,
  createOAuthState,
  validateOAuthState,
  isCredentialProvider,
  retrieveTempCredentials,
  validateMegaCredentials,
  validateS3Credentials,
  type OAuthTokens,
  type ProviderType,
} from './provider-adapters';

// ─── Legacy DB type → API type mapping ──────────────────────────────────────────

const DB_TYPE_TO_API: Record<string, ProviderType> = {
  gdrive: 'google_drive',
  s3: 'aws_s3',
};

function mapDbType(dbType: string): ProviderType {
  return (DB_TYPE_TO_API[dbType] || dbType) as ProviderType;
}

const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  google_drive: 'My Google Drive',
  onedrive: 'My OneDrive',
  dropbox: 'My Dropbox',
  mega: 'My MEGA',
  aws_s3: 'My AWS S3',
  box: 'My Box',
};

// ─── Row → API response mapping ─────────────────────────────────────────────────

interface ProviderRow {
  id: string;
  user_id: string;
  type: string;
  label: string;
  display_name: string | null;
  email: string | null;
  credentials: Record<string, any>;
  storage_used: number;
  storage_total: number | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRowToResponse(row: ProviderRow) {
  const providerType = mapDbType(row.type);
  return {
    id: row.id,
    provider_type: providerType,
    display_name:
      row.display_name || row.label || PROVIDER_DISPLAY_NAMES[providerType],
    email: row.email || '',
    status: row.is_active ? 'connected' : 'disconnected',
    storage_used: row.storage_used || 0,
    storage_total: row.storage_total || 0,
    last_synced_at: row.last_synced_at,
    connected_at: row.created_at,
  };
}

// ─── Token helpers ───────────────────────────────────────────────────────────────

/** How many ms before expiry we proactively refresh. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Compute `expires_at` (Unix ms) from the raw `expires_in` (seconds) returned
 * by OAuth endpoints, and merge it into the token object.
 */
function withExpiresAt(tokens: OAuthTokens): OAuthTokens {
  return {
    ...tokens,
    expires_at: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined,
  };
}

/**
 * Return a valid access token for the given provider row, refreshing silently
 * when the stored token is expired or about to expire.
 *
 * If tokens were refreshed, `updatedCredentials` is returned so the caller can
 * persist the new values to the DB.
 */
async function getValidAccessToken(row: ProviderRow): Promise<{
  accessToken: string;
  updatedCredentials?: Record<string, any>;
}> {
  const credentials = decryptCredentials(row.credentials);
  const { access_token, refresh_token, expires_at } = credentials as OAuthTokens;

  if (!access_token) {
    const err: any = new Error('No access token available. Please reconnect the provider.');
    err.statusCode = 401;
    throw err;
  }

  // Token is still valid (or has no expiry info stored) — use it as-is.
  if (!expires_at || Date.now() < expires_at - REFRESH_BUFFER_MS) {
    return { accessToken: access_token };
  }

  // Token is expired or expiring soon — attempt a silent refresh.
  if (!refresh_token) {
    const err: any = new Error('Access token expired. Please reconnect the provider.');
    err.statusCode = 401;
    throw err;
  }

  const providerType = mapDbType(row.type);
  const newTokens = withExpiresAt(await refreshAccessToken(providerType, refresh_token));

  // Merge new tokens, preserving the refresh_token if the provider didn't issue
  // a new one (Google keeps the same refresh_token; Box rotates it).
  const updatedPlain: OAuthTokens = {
    ...credentials,
    access_token: newTokens.access_token,
    expires_in: newTokens.expires_in,
    expires_at: newTokens.expires_at,
    refresh_token: newTokens.refresh_token ?? refresh_token,
  };

  return {
    accessToken: newTokens.access_token,
    updatedCredentials: updatedPlain,
  };
}

// ─── Service Functions ──────────────────────────────────────────────────────────

/** List all connected providers for a user. */
export async function listProviders(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('providers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map((row: ProviderRow) => mapRowToResponse(row));
}

/** Get a single provider's detail. */
export async function getProviderDetail(userId: string, providerId: string) {
  const { data, error } = await supabaseAdmin
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    const err: any = new Error('Provider not found');
    err.statusCode = 404;
    throw err;
  }
  return mapRowToResponse(data as ProviderRow);
}

/** Generate an OAuth authorization URL (or credential form URL). */
export async function generateOAuthUrl(
  userId: string,
  providerType: ProviderType,
  formBaseUrl?: string,
) {
  const state = createOAuthState(userId, providerType);

  // For credential-based providers (MEGA / S3), use the hosted form URL.
  // For OAuth providers, use the backend's own HTTPS callback endpoint so that
  // Google / OneDrive / Dropbox / Box accept it as an authorized redirect URI.
  // The backend callback will then forward the code to the app via deep link.
  const redirectUri = formBaseUrl
    ? `${formBaseUrl}/api/providers/oauth/callback`
    : 'cloudshelve://oauth/callback';

  const authorizationUrl = getAuthorizationUrl(
    providerType,
    redirectUri,
    state,
    formBaseUrl,
  );
  // Return redirect_uri so the frontend can pass it back during the connect step
  // (token exchange requires the same redirect_uri that was used in the auth URL).
  return { authorization_url: authorizationUrl, state, redirect_uri: redirectUri };
}

/** Exchange auth code / temp credentials for a provider connection. */
export async function connectProvider(
  userId: string,
  body: {
    provider_type: ProviderType;
    authorization_code: string;
    state: string;
    redirect_uri: string;
  },
) {
  // Validate CSRF state
  const stateEntry = validateOAuthState(body.state, userId);
  if (!stateEntry) {
    const err: any = new Error('Invalid or expired state token');
    err.statusCode = 400;
    throw err;
  }

  let email: string;
  let displayName: string;
  let storageUsed: number;
  let storageTotal: number;
  let plainCredentials: Record<string, any>;

  if (isCredentialProvider(body.provider_type)) {
    // ── Credential-based provider (MEGA / S3) ──
    const tempCred = retrieveTempCredentials(body.authorization_code);
    if (!tempCred) {
      const err: any = new Error('Invalid or expired authorization code');
      err.statusCode = 400;
      throw err;
    }

    if (body.provider_type === 'mega') {
      const info = await validateMegaCredentials(
        tempCred.credentials.email,
        tempCred.credentials.password,
      );
      email = info.email;
      displayName = info.displayName;
      storageUsed = info.storageUsed;
      storageTotal = info.storageTotal;
      plainCredentials = {
        email: tempCred.credentials.email,
        password: tempCred.credentials.password,
      };
    } else if (body.provider_type === 'aws_s3') {
      const info = await validateS3Credentials(
        tempCred.credentials.access_key_id,
        tempCred.credentials.secret_access_key,
        tempCred.credentials.region,
        tempCred.credentials.bucket,
      );
      email = info.email;
      displayName = info.displayName;
      storageUsed = info.storageUsed;
      storageTotal = info.storageTotal;
      plainCredentials = {
        access_key_id: tempCred.credentials.access_key_id,
        secret_access_key: tempCred.credentials.secret_access_key,
        region: tempCred.credentials.region,
        bucket: tempCred.credentials.bucket || undefined,
      };
    } else {
      const err: any = new Error('Unsupported credential provider');
      err.statusCode = 400;
      throw err;
    }
  } else {
    // ── OAuth provider (Google / OneDrive / Dropbox / Box) ──
    const rawTokens = await exchangeCode(
      body.provider_type,
      body.authorization_code,
      body.redirect_uri,
    );
    // Compute and store expires_at so we can detect expiry on future calls.
    const tokens = withExpiresAt(rawTokens);

    const userInfo = await getUserInfo(body.provider_type, tokens.access_token);
    const storage = await getStorageQuota(body.provider_type, tokens.access_token);

    email = userInfo.email;
    displayName = userInfo.displayName;
    storageUsed = storage.used;
    storageTotal = storage.total;
    plainCredentials = tokens;
  }

  // Encrypt credentials before persisting to the DB.
  const encryptedCredentials = encryptCredentials(plainCredentials);

  // Insert provider record — no unique constraint on (user_id, type), so multiple
  // accounts from the same provider (e.g. two Google Drive accounts) are supported.
  const { data, error } = await supabaseAdmin
    .from('providers')
    .insert({
      user_id: userId,
      type: body.provider_type,
      label: displayName,
      display_name: displayName,
      email,
      credentials: encryptedCredentials,
      storage_used: storageUsed,
      storage_total: storageTotal,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRowToResponse(data as ProviderRow);
}

/** Disconnect a provider: revoke tokens and delete the record. */
export async function disconnectProvider(userId: string, providerId: string) {
  const { data: provider, error: fetchError } = await supabaseAdmin
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !provider) {
    const err: any = new Error('Provider not found');
    err.statusCode = 404;
    throw err;
  }

  const row = provider as ProviderRow;
  // Decrypt before passing to the revocation helper.
  const plainCredentials = decryptCredentials(row.credentials);

  await revokeTokens(mapDbType(row.type), plainCredentials);

  const { error } = await supabaseAdmin
    .from('providers')
    .delete()
    .eq('id', providerId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

/** Trigger a manual sync: re-fetch storage quota from the provider. */
export async function syncProvider(userId: string, providerId: string) {
  const { data: provider, error: fetchError } = await supabaseAdmin
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !provider) {
    const err: any = new Error('Provider not found');
    err.statusCode = 404;
    throw err;
  }

  const row = provider as ProviderRow;
  const providerType = mapDbType(row.type);
  let storageUsed = row.storage_used;
  let storageTotal = row.storage_total || 0;

  if (isCredentialProvider(providerType)) {
    const credentials = decryptCredentials(row.credentials);
    if (providerType === 'mega') {
      const info = await validateMegaCredentials(
        credentials.email,
        credentials.password,
      );
      storageUsed = info.storageUsed;
      storageTotal = info.storageTotal;
    } else if (providerType === 'aws_s3') {
      const info = await validateS3Credentials(
        credentials.access_key_id,
        credentials.secret_access_key,
        credentials.region,
        credentials.bucket,
      );
      storageUsed = info.storageUsed;
      storageTotal = info.storageTotal;
    }
  } else {
    // OAuth: get a valid (auto-refreshed if needed) access token.
    const { accessToken, updatedCredentials } = await getValidAccessToken(row);

    // If a silent refresh occurred, persist the new encrypted credentials first.
    if (updatedCredentials) {
      await supabaseAdmin
        .from('providers')
        .update({ credentials: encryptCredentials(updatedCredentials) })
        .eq('id', providerId)
        .eq('user_id', userId);
    }

    const storage = await getStorageQuota(providerType, accessToken);
    storageUsed = storage.used;
    storageTotal = storage.total;
  }

  const { data, error } = await supabaseAdmin
    .from('providers')
    .update({
      storage_used: storageUsed,
      storage_total: storageTotal,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', providerId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRowToResponse(data as ProviderRow);
}
