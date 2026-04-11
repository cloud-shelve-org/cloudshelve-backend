import type { ProviderType } from './provider-adapters';
import { env } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileItemKind = 'file' | 'folder';

export interface FileItem {
  id: string;
  name: string;
  kind: FileItemKind;
  mimeType: string | null;
  size: number | null;           // bytes; null for folders
  modifiedAt: string | null;     // ISO-8601
  thumbnailUrl: string | null;
  downloadUrl: string | null;    // direct download; null for folders
  path: string | null;           // provider-specific path string
  parentId: string | null;
}

export interface ListFilesResult {
  items: FileItem[];
  nextPageToken: string | null;  // pass back on next call for pagination
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function listFiles(
  providerType: ProviderType,
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  switch (providerType) {
    case 'google_drive':
      return listGoogleDriveFiles(accessToken, folderId, pageToken, pageSize);
    case 'onedrive':
      return listOneDriveFiles(accessToken, folderId, pageToken, pageSize);
    case 'dropbox':
      return listDropboxFiles(accessToken, folderId, pageToken, pageSize);
    case 'box':
      return listBoxFiles(accessToken, folderId, pageToken, pageSize);
    default:
      throw new Error(`File listing not supported for ${providerType}`);
  }
}

export async function searchFiles(
  providerType: ProviderType,
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  switch (providerType) {
    case 'google_drive':
      return searchGoogleDriveFiles(accessToken, query, pageToken, pageSize);
    case 'onedrive':
      return searchOneDriveFiles(accessToken, query, pageToken, pageSize);
    case 'dropbox':
      return searchDropboxFiles(accessToken, query, pageToken, pageSize);
    case 'box':
      return searchBoxFiles(accessToken, query, pageToken, pageSize);
    default:
      throw new Error(`File search not supported for ${providerType}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE
// ═══════════════════════════════════════════════════════════════════════════════

// Google Drive MIME type for folders
const GDRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
// Fields to request from the Files API
const GDRIVE_FIELDS =
  'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,parents)';

async function listGoogleDriveFiles(
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const parent = folderId || 'root';
  const params = new URLSearchParams({
    q: `'${parent}' in parents and trashed = false`,
    fields: GDRIVE_FIELDS,
    orderBy: 'folder,name',
    pageSize: String(pageSize),
    ...(pageToken ? { pageToken } : {}),
  });

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Google Drive list failed: ${await resp.text()}`);

  const data: any = await resp.json();
  return {
    items: (data.files || []).map(mapGoogleDriveItem),
    nextPageToken: data.nextPageToken || null,
  };
}

async function searchGoogleDriveFiles(
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const params = new URLSearchParams({
    q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
    fields: GDRIVE_FIELDS,
    orderBy: 'relevance',
    pageSize: String(pageSize),
    ...(pageToken ? { pageToken } : {}),
  });

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Google Drive search failed: ${await resp.text()}`);

  const data: any = await resp.json();
  return {
    items: (data.files || []).map(mapGoogleDriveItem),
    nextPageToken: data.nextPageToken || null,
  };
}

function mapGoogleDriveItem(f: any): FileItem {
  const isFolder = f.mimeType === GDRIVE_FOLDER_MIME;
  return {
    id: f.id,
    name: f.name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: f.mimeType || null,
    size: f.size ? parseInt(f.size, 10) : null,
    modifiedAt: f.modifiedTime || null,
    thumbnailUrl: f.thumbnailLink || null,
    downloadUrl: f.webContentLink || null,
    path: null,
    parentId: f.parents?.[0] || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONEDRIVE
// ═══════════════════════════════════════════════════════════════════════════════

async function listOneDriveFiles(
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const base = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;

  const params = new URLSearchParams({
    $select: 'id,name,file,folder,size,lastModifiedDateTime,thumbnails,@microsoft.graph.downloadUrl,parentReference',
    $orderby: 'name asc',
    $top: String(pageSize),
    ...(pageToken ? { $skiptoken: pageToken } : {}),
  });

  const resp = await fetch(`${base}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`OneDrive list failed: ${await resp.text()}`);

  const data: any = await resp.json();
  // Extract skiptoken from @odata.nextLink
  const nextLink: string | null = data['@odata.nextLink'] || null;
  const nextPageToken = nextLink
    ? new URL(nextLink).searchParams.get('$skiptoken')
    : null;

  return {
    items: (data.value || []).map(mapOneDriveItem),
    nextPageToken,
  };
}

async function searchOneDriveFiles(
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const params = new URLSearchParams({
    q: query,
    $select: 'id,name,file,folder,size,lastModifiedDateTime,@microsoft.graph.downloadUrl,parentReference',
    $top: String(pageSize),
    ...(pageToken ? { $skiptoken: pageToken } : {}),
  });

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`OneDrive search failed: ${await resp.text()}`);

  const data: any = await resp.json();
  const nextLink: string | null = data['@odata.nextLink'] || null;
  const nextPageToken = nextLink
    ? new URL(nextLink).searchParams.get('$skiptoken')
    : null;

  return {
    items: (data.value || []).map(mapOneDriveItem),
    nextPageToken,
  };
}

function mapOneDriveItem(f: any): FileItem {
  const isFolder = !!f.folder;
  return {
    id: f.id,
    name: f.name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: f.file?.mimeType || null,
    size: f.size || null,
    modifiedAt: f.lastModifiedDateTime || null,
    thumbnailUrl: f.thumbnails?.[0]?.medium?.url || null,
    downloadUrl: f['@microsoft.graph.downloadUrl'] || null,
    path: f.parentReference?.path || null,
    parentId: f.parentReference?.id || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DROPBOX
// ═══════════════════════════════════════════════════════════════════════════════

async function listDropboxFiles(
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  let url: string;
  let body: any;

  if (pageToken) {
    url = 'https://api.dropboxapi.com/2/files/list_folder/continue';
    body = { cursor: pageToken };
  } else {
    url = 'https://api.dropboxapi.com/2/files/list_folder';
    body = {
      path: folderId || '',
      limit: pageSize,
      include_media_info: true,
    };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Dropbox list failed: ${await resp.text()}`);

  const data: any = await resp.json();
  return {
    items: (data.entries || []).map(mapDropboxItem),
    nextPageToken: data.has_more ? data.cursor : null,
  };
}

async function searchDropboxFiles(
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  let url: string;
  let body: any;

  if (pageToken) {
    url = 'https://api.dropboxapi.com/2/files/search/continue_v2';
    body = { cursor: pageToken };
  } else {
    url = 'https://api.dropboxapi.com/2/files/search_v2';
    body = {
      query,
      options: { max_results: pageSize, file_status: 'active' },
    };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Dropbox search failed: ${await resp.text()}`);

  const data: any = await resp.json();
  const items = (data.matches || [])
    .map((m: any) => m.metadata?.metadata)
    .filter(Boolean)
    .map(mapDropboxItem);

  return {
    items,
    nextPageToken: data.has_more ? data.cursor : null,
  };
}

function mapDropboxItem(f: any): FileItem {
  const isFolder = f['.tag'] === 'folder';
  return {
    id: f.id || f.path_lower,
    name: f.name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: null,  // Dropbox doesn't return MIME types
    size: f.size || null,
    modifiedAt: f.server_modified || f.client_modified || null,
    thumbnailUrl: null,
    downloadUrl: null,  // requires a separate create_shared_link call
    path: f.path_lower || null,
    parentId: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOX
// ═══════════════════════════════════════════════════════════════════════════════

async function listBoxFiles(
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const folder = folderId || '0';  // '0' is Box root
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({
    fields: 'id,name,type,size,modified_at,parent',
    limit: String(pageSize),
    offset: String(offset),
  });

  const resp = await fetch(`https://api.box.com/2.0/folders/${folder}/items?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Box list failed: ${await resp.text()}`);

  const data: any = await resp.json();
  const total = data.total_count || 0;
  const nextOffset = offset + (data.entries?.length || 0);
  const hasMore = nextOffset < total;

  return {
    items: (data.entries || []).map(mapBoxItem),
    nextPageToken: hasMore ? String(nextOffset) : null,
  };
}

async function searchBoxFiles(
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({
    query,
    fields: 'id,name,type,size,modified_at,parent',
    limit: String(pageSize),
    offset: String(offset),
  });

  const resp = await fetch(`https://api.box.com/2.0/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Box search failed: ${await resp.text()}`);

  const data: any = await resp.json();
  const total = data.total_count || 0;
  const nextOffset = offset + (data.entries?.length || 0);
  const hasMore = nextOffset < total;

  return {
    items: (data.entries || []).map(mapBoxItem),
    nextPageToken: hasMore ? String(nextOffset) : null,
  };
}

function mapBoxItem(f: any): FileItem {
  const isFolder = f.type === 'folder';
  return {
    id: f.id,
    name: f.name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: null,
    size: f.size || null,
    modifiedAt: f.modified_at || null,
    thumbnailUrl: null,
    downloadUrl: null,
    path: null,
    parentId: f.parent?.id || null,
  };
}
