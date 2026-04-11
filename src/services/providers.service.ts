import { supabaseAdmin } from '../config/supabase';
import {
  getAuthorizationUrl,
  exchangeCode,
  getUserInfo,
  getStorageQuota,
  revokeTokens,
  createOAuthState,
  validateOAuthState,
  isCredentialProvider,
  retrieveTempCredentials,
  validateMegaCredentials,
  validateS3Credentials,
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
  let credentials: Record<string, any>;

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
      credentials = {
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
      credentials = {
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
    const tokens = await exchangeCode(
      body.provider_type,
      body.authorization_code,
      body.redirect_uri,
    );
    const userInfo = await getUserInfo(
      body.provider_type,
      tokens.access_token,
    );
    const storage = await getStorageQuota(
      body.provider_type,
      tokens.access_token,
    );

    email = userInfo.email;
    displayName = userInfo.displayName;
    storageUsed = storage.used;
    storageTotal = storage.total;
    credentials = tokens;
  }

  // Insert provider record
  const { data, error } = await supabaseAdmin
    .from('providers')
    .insert({
      user_id: userId,
      type: body.provider_type,
      label: displayName,
      display_name: displayName,
      email,
      credentials,
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
  // Fetch the provider first to get credentials for revocation
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

  // Best-effort token revocation
  await revokeTokens(
    mapDbType((provider as ProviderRow).type),
    (provider as ProviderRow).credentials || {},
  );

  // Delete the record
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
    // Re-validate credentials and refresh storage info
    if (providerType === 'mega') {
      const info = await validateMegaCredentials(
        row.credentials.email,
        row.credentials.password,
      );
      storageUsed = info.storageUsed;
      storageTotal = info.storageTotal;
    } else if (providerType === 'aws_s3') {
      const info = await validateS3Credentials(
        row.credentials.access_key_id,
        row.credentials.secret_access_key,
        row.credentials.region,
        row.credentials.bucket,
      );
      storageUsed = info.storageUsed;
      storageTotal = info.storageTotal;
    }
  } else {
    // OAuth: refresh storage quota using stored access token
    const accessToken = row.credentials?.access_token;
    if (!accessToken) {
      const err: any = new Error(
        'No access token available. Please reconnect the provider.',
      );
      err.statusCode = 401;
      throw err;
    }

    const storage = await getStorageQuota(providerType, accessToken);
    storageUsed = storage.used;
    storageTotal = storage.total;
  }

  // Update the record
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
