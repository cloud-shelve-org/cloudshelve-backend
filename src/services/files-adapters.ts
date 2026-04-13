import type { ProviderType } from './provider-adapters';

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
  nextPageToken: string | null;
}

// ─── Dispatchers ─────────────────────────────────────────────────────────────

export async function listFiles(
  providerType: ProviderType,
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  switch (providerType) {
    case 'google_drive': return listGoogleDriveFiles(accessToken, folderId, pageToken, pageSize);
    case 'onedrive':     return listOneDriveFiles(accessToken, folderId, pageToken, pageSize);
    case 'dropbox':      return listDropboxFiles(accessToken, folderId, pageToken, pageSize);
    case 'box':          return listBoxFiles(accessToken, folderId, pageToken, pageSize);
    case 'mega':         return listMegaFiles(accessToken, folderId, pageToken, pageSize);
    default: throw new Error(`File listing not supported for ${providerType}`);
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
    case 'google_drive': return searchGoogleDriveFiles(accessToken, query, pageToken, pageSize);
    case 'onedrive':     return searchOneDriveFiles(accessToken, query, pageToken, pageSize);
    case 'dropbox':      return searchDropboxFiles(accessToken, query, pageToken, pageSize);
    case 'box':          return searchBoxFiles(accessToken, query, pageToken, pageSize);
    case 'mega':         return searchMegaFiles(accessToken, query, pageToken, pageSize);
    default: throw new Error(`File search not supported for ${providerType}`);
  }
}

export async function createFolder(
  providerType: ProviderType,
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<FileItem> {
  switch (providerType) {
    case 'google_drive': return createGoogleDriveFolder(accessToken, parentId, name);
    case 'onedrive':     return createOneDriveFolder(accessToken, parentId, name);
    case 'dropbox':      return createDropboxFolder(accessToken, parentId, name);
    case 'box':          return createBoxFolder(accessToken, parentId, name);
    case 'mega':         return createMegaFolder(accessToken, parentId, name);
    default: throw new Error(`Folder creation not supported for ${providerType}`);
  }
}

export async function deleteFile(
  providerType: ProviderType,
  accessToken: string,
  fileId: string,
  filePath?: string | null,
): Promise<void> {
  switch (providerType) {
    case 'google_drive': return deleteGoogleDriveFile(accessToken, fileId);
    case 'onedrive':     return deleteOneDriveFile(accessToken, fileId);
    case 'dropbox':      return deleteDropboxFile(accessToken, filePath || fileId);
    case 'box':          return deleteBoxFile(accessToken, fileId);
    case 'mega':         return deleteMegaFile(accessToken, fileId);
    default: throw new Error(`File deletion not supported for ${providerType}`);
  }
}

export async function renameFile(
  providerType: ProviderType,
  accessToken: string,
  fileId: string,
  newName: string,
  filePath?: string | null,
): Promise<FileItem> {
  switch (providerType) {
    case 'google_drive': return renameGoogleDriveFile(accessToken, fileId, newName);
    case 'onedrive':     return renameOneDriveFile(accessToken, fileId, newName);
    case 'dropbox':      return renameDropboxFile(accessToken, fileId, newName, filePath);
    case 'box':          return renameBoxFile(accessToken, fileId, newName);
    case 'mega':         return renameMegaFile(accessToken, fileId, newName);
    default: throw new Error(`Rename not supported for ${providerType}`);
  }
}

export async function uploadFile(
  providerType: ProviderType,
  accessToken: string,
  parentId: string | null,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<FileItem> {
  switch (providerType) {
    case 'google_drive': return uploadGoogleDriveFile(accessToken, parentId, fileName, mimeType, buffer);
    case 'onedrive':     return uploadOneDriveFile(accessToken, parentId, fileName, mimeType, buffer);
    case 'dropbox':      return uploadDropboxFile(accessToken, parentId, fileName, buffer);
    case 'box':          return uploadBoxFile(accessToken, parentId, fileName, mimeType, buffer);
    case 'mega':         return uploadMegaFile(accessToken, parentId, fileName, buffer);
    default: throw new Error(`File upload not supported for ${providerType}`);
  }
}

export interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export async function downloadFile(
  providerType: ProviderType,
  accessToken: string,
  fileId: string,
  fileName: string,
  filePath?: string | null,
): Promise<DownloadResult> {
  switch (providerType) {
    case 'google_drive': return downloadGoogleDriveFile(accessToken, fileId, fileName);
    case 'onedrive':     return downloadOneDriveFile(accessToken, fileId, fileName);
    case 'dropbox':      return downloadDropboxFile(accessToken, filePath || fileId, fileName);
    case 'box':          return downloadBoxFile(accessToken, fileId, fileName);
    case 'mega':         return downloadMegaFile(accessToken, fileId, fileName);
    default: throw new Error(`File download not supported for ${providerType}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE
// ═══════════════════════════════════════════════════════════════════════════════

const GDRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDRIVE_FIELDS =
  'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,parents)';
const GDRIVE_FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,parents';

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
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    ...(pageToken ? { pageToken } : {}),
  });
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Google Drive list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return { items: (data.files || []).map(mapGoogleDriveItem), nextPageToken: data.nextPageToken || null };
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
  return { items: (data.files || []).map(mapGoogleDriveItem), nextPageToken: data.nextPageToken || null };
}

async function createGoogleDriveFolder(
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<FileItem> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?fields=${GDRIVE_FILE_FIELDS}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: GDRIVE_FOLDER_MIME, parents: [parentId || 'root'] }),
    },
  );
  if (!resp.ok) throw new Error(`Google Drive create folder failed: ${await resp.text()}`);
  return mapGoogleDriveItem(await resp.json());
}

async function deleteGoogleDriveFile(accessToken: string, fileId: string): Promise<void> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 204) throw new Error(`Google Drive delete failed: ${await resp.text()}`);
}

async function renameGoogleDriveFile(accessToken: string, fileId: string, newName: string): Promise<FileItem> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${GDRIVE_FILE_FIELDS}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    },
  );
  if (!resp.ok) throw new Error(`Google Drive rename failed: ${await resp.text()}`);
  return mapGoogleDriveItem(await resp.json());
}

async function uploadGoogleDriveFile(
  accessToken: string,
  parentId: string | null,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<FileItem> {
  const metadata = JSON.stringify({ name: fileName, parents: [parentId || 'root'] });
  const boundary = '===cloudshelve_boundary===';

  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const resp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${GDRIVE_FILE_FIELDS}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipart.length),
      },
      body: multipart,
    },
  );
  if (!resp.ok) throw new Error(`Google Drive upload failed: ${await resp.text()}`);
  return mapGoogleDriveItem(await resp.json());
}

// Google Workspace mimeType → export mimeType + extension.
// null = file type has no export support and must be skipped by the worker.
const GDRIVE_EXPORT_MIME: Record<string, { mime: string; ext: string } | null> = {
  // Exportable Workspace types
  'application/vnd.google-apps.document':     { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  ext: '.docx' },
  'application/vnd.google-apps.spreadsheet':  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
  'application/vnd.google-apps.drawing':      { mime: 'image/png',                                                                ext: '.png'  },
  'application/vnd.google-apps.script':       { mime: 'application/vnd.google-apps.script+json',                                 ext: '.json' },
  // Non-exportable Workspace types — no download format exists
  'application/vnd.google-apps.form':         null,
  'application/vnd.google-apps.map':          null,
  'application/vnd.google-apps.site':         null,
  'application/vnd.google-apps.fusiontable':  null,
  'application/vnd.google-apps.jam':          null,
  'application/vnd.google-apps.shortcut':     null,
};

export type GDriveSkipReason = 'download_restricted' | 'not_exportable';

/** Thrown when a file cannot be downloaded/exported — the worker should skip it, not abort. */
export class GDriveNotExportableError extends Error {
  readonly code   = 'GDRIVE_NOT_EXPORTABLE' as const;
  readonly reason : GDriveSkipReason;
  constructor(fileName: string, mimeType: string, reason: GDriveSkipReason = 'not_exportable') {
    super(`"${fileName}" (${mimeType}) skipped: ${reason}`);
    this.reason = reason;
  }
}

async function downloadGoogleDriveFile(accessToken: string, fileId: string, fileName: string): Promise<DownloadResult> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Attempt direct binary download.
  // supportsAllDrives=true  — required for files in shared/team drives.
  // acknowledgeAbuse=true   — bypasses the virus-scan warning for large files.
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
    { headers },
  );

  if (resp.ok) {
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType, fileName };
  }

  // Google Workspace files return 403 fileNotDownloadable — must use the export endpoint
  const body = await resp.text();
  if (!(resp.status === 403 && body.includes('fileNotDownloadable'))) {
    throw new Error(`Google Drive download failed: ${resp.status} ${body}`);
  }

  // Fetch file metadata to determine mimeType
  const metaResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType%2Cname`,
    { headers },
  );
  if (!metaResp.ok) throw new Error(`Google Drive metadata fetch failed: ${metaResp.status}`);
  const meta = await metaResp.json() as { mimeType?: string; name?: string };
  const mimeType = meta.mimeType ?? '';

  // The export endpoint only works for Google Workspace types (vnd.google-apps.*).
  // Regular files (PDF, DOCX, images, etc.) that failed ?alt=media have download
  // restrictions set on them — they cannot be copied and must be skipped.
  if (!mimeType.startsWith('application/vnd.google-apps.')) {
    throw new GDriveNotExportableError(fileName, mimeType, 'download_restricted');
  }

  // undefined = unknown Workspace type (fall back to PDF); null = known non-exportable
  const exportEntry = Object.prototype.hasOwnProperty.call(GDRIVE_EXPORT_MIME, mimeType)
    ? GDRIVE_EXPORT_MIME[mimeType]
    : undefined;

  if (exportEntry === null) {
    throw new GDriveNotExportableError(fileName, mimeType, 'not_exportable');
  }

  const exportMime = exportEntry?.mime ?? 'application/pdf';
  const exportExt  = exportEntry?.ext  ?? '.pdf';

  const exportResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
    { headers },
  );
  if (!exportResp.ok) {
    if (exportResp.status === 400) throw new GDriveNotExportableError(fileName, mimeType, 'not_exportable');
    throw new Error(`Google Drive export failed: ${exportResp.status} ${await exportResp.text()}`);
  }

  const buffer         = Buffer.from(await exportResp.arrayBuffer());
  const baseName       = fileName.replace(/\.[^.]+$/, '') || fileName;
  const exportFileName = `${baseName}${exportExt}`;
  return { buffer, contentType: exportMime, fileName: exportFileName };
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

const OD_SELECT = 'id,name,file,folder,size,lastModifiedDateTime,thumbnails,@microsoft.graph.downloadUrl,parentReference';

async function listOneDriveFiles(
  accessToken: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const base = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;
  const params = new URLSearchParams({ $select: OD_SELECT, $orderby: 'name asc', $top: String(pageSize), ...(pageToken ? { $skiptoken: pageToken } : {}) });
  const resp = await fetch(`${base}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`OneDrive list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const nextLink: string | null = data['@odata.nextLink'] || null;
  const nextPageToken = nextLink ? new URL(nextLink).searchParams.get('$skiptoken') : null;
  return { items: (data.value || []).map(mapOneDriveItem), nextPageToken };
}

async function searchOneDriveFiles(
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const params = new URLSearchParams({ q: query, $select: OD_SELECT, $top: String(pageSize), ...(pageToken ? { $skiptoken: pageToken } : {}) });
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`OneDrive search failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const nextLink: string | null = data['@odata.nextLink'] || null;
  const nextPageToken = nextLink ? new URL(nextLink).searchParams.get('$skiptoken') : null;
  return { items: (data.value || []).map(mapOneDriveItem), nextPageToken };
}

async function createOneDriveFolder(
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<FileItem> {
  const url = parentId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
  });
  if (!resp.ok) throw new Error(`OneDrive create folder failed: ${await resp.text()}`);
  return mapOneDriveItem(await resp.json());
}

async function deleteOneDriveFile(accessToken: string, fileId: string): Promise<void> {
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 204) throw new Error(`OneDrive delete failed: ${await resp.text()}`);
}

async function renameOneDriveFile(accessToken: string, fileId: string, newName: string): Promise<FileItem> {
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!resp.ok) throw new Error(`OneDrive rename failed: ${await resp.text()}`);
  return mapOneDriveItem(await resp.json());
}

async function uploadOneDriveFile(
  accessToken: string,
  parentId: string | null,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<FileItem> {
  const url = parentId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(fileName)}:/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType },
    body: buffer,
  });
  if (!resp.ok) throw new Error(`OneDrive upload failed: ${await resp.text()}`);
  return mapOneDriveItem(await resp.json());
}

async function downloadOneDriveFile(accessToken: string, fileId: string, fileName: string): Promise<DownloadResult> {
  // Graph /content returns a 302 redirect to a CDN URL; fetch follows it automatically
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`OneDrive download failed: ${resp.status} ${await resp.text()}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get('content-type') || 'application/octet-stream';
  return { buffer, contentType, fileName };
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
    body = { path: folderId || '', limit: pageSize, include_media_info: true };
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Dropbox list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return { items: (data.entries || []).map(mapDropboxItem), nextPageToken: data.has_more ? data.cursor : null };
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
    body = { query, options: { max_results: pageSize, file_status: 'active' } };
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Dropbox search failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const items = (data.matches || []).map((m: any) => m.metadata?.metadata).filter(Boolean).map(mapDropboxItem);
  return { items, nextPageToken: data.has_more ? data.cursor : null };
}

async function createDropboxFolder(
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<FileItem> {
  // parentId is either empty (root) or a Dropbox path/ID
  const parentPath = parentId && !parentId.startsWith('id:') ? parentId : '';
  const path = `${parentPath}/${name}`.replace('//', '/');
  const resp = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, autorename: true }),
  });
  if (!resp.ok) throw new Error(`Dropbox create folder failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return mapDropboxItem(data.metadata);
}

async function deleteDropboxFile(accessToken: string, filePath: string): Promise<void> {
  const resp = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });
  if (!resp.ok) throw new Error(`Dropbox delete failed: ${await resp.text()}`);
}

async function renameDropboxFile(
  accessToken: string,
  fileId: string,
  newName: string,
  filePath?: string | null,
): Promise<FileItem> {
  // Resolve current path: use filePath if available, else fetch metadata
  let currentPath = filePath;
  if (!currentPath) {
    const metaResp = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileId.startsWith('id:') ? fileId : `id:${fileId}` }),
    });
    if (!metaResp.ok) throw new Error(`Dropbox get metadata failed: ${await metaResp.text()}`);
    const meta: any = await metaResp.json();
    currentPath = meta.path_lower;
  }
  const parentPath = currentPath!.substring(0, currentPath!.lastIndexOf('/'));
  const toPath = `${parentPath}/${newName}`;
  const resp = await fetch('https://api.dropboxapi.com/2/files/move_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_path: currentPath, to_path: toPath, autorename: false }),
  });
  if (!resp.ok) throw new Error(`Dropbox rename failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return mapDropboxItem(data.metadata);
}

async function uploadDropboxFile(
  accessToken: string,
  parentId: string | null,
  fileName: string,
  buffer: Buffer,
): Promise<FileItem> {
  const parentPath = parentId && !parentId.startsWith('id:') ? parentId : '';
  const path = `${parentPath}/${fileName}`.replace('//', '/');
  const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true }),
    },
    body: buffer,
  });
  if (!resp.ok) throw new Error(`Dropbox upload failed: ${await resp.text()}`);
  return mapDropboxItem(await resp.json());
}

async function downloadDropboxFile(accessToken: string, filePath: string, fileName: string): Promise<DownloadResult> {
  const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath.startsWith('id:') ? filePath : filePath }),
      'Content-Type': 'text/plain; charset=dropbox-cors-hack',
    },
  });
  if (!resp.ok) throw new Error(`Dropbox download failed: ${resp.status} ${await resp.text()}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get('content-type') || 'application/octet-stream';
  return { buffer, contentType, fileName };
}

function mapDropboxItem(f: any): FileItem {
  const isFolder = f['.tag'] === 'folder';
  return {
    id: f.id || f.path_lower,
    name: f.name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: null,
    size: f.size || null,
    modifiedAt: f.server_modified || f.client_modified || null,
    thumbnailUrl: null,
    downloadUrl: null,
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
  const folder = folderId || '0';
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({ fields: 'id,name,type,size,modified_at,parent', limit: String(pageSize), offset: String(offset) });
  const resp = await fetch(`https://api.box.com/2.0/folders/${folder}/items?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Box list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const total = data.total_count || 0;
  const nextOffset = offset + (data.entries?.length || 0);
  return { items: (data.entries || []).map(mapBoxItem), nextPageToken: nextOffset < total ? String(nextOffset) : null };
}

async function searchBoxFiles(
  accessToken: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({ query, fields: 'id,name,type,size,modified_at,parent', limit: String(pageSize), offset: String(offset) });
  const resp = await fetch(`https://api.box.com/2.0/search?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Box search failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const total = data.total_count || 0;
  const nextOffset = offset + (data.entries?.length || 0);
  return { items: (data.entries || []).map(mapBoxItem), nextPageToken: nextOffset < total ? String(nextOffset) : null };
}

async function createBoxFolder(
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<FileItem> {
  const resp = await fetch('https://api.box.com/2.0/folders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent: { id: parentId || '0' } }),
  });
  if (!resp.ok) throw new Error(`Box create folder failed: ${await resp.text()}`);
  return mapBoxItem(await resp.json());
}

async function deleteBoxFile(accessToken: string, fileId: string): Promise<void> {
  // Try file first, then folder
  let resp = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) {
    resp = await fetch(`https://api.box.com/2.0/folders/${fileId}?recursive=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
  if (!resp.ok && resp.status !== 204) throw new Error(`Box delete failed: ${await resp.text()}`);
}

async function renameBoxFile(accessToken: string, fileId: string, newName: string): Promise<FileItem> {
  // Try file, fallback to folder
  let resp = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (resp.status === 404) {
    resp = await fetch(`https://api.box.com/2.0/folders/${fileId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
  }
  if (!resp.ok) throw new Error(`Box rename failed: ${await resp.text()}`);
  return mapBoxItem(await resp.json());
}

async function uploadBoxFile(
  accessToken: string,
  parentId: string | null,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<FileItem> {
  const attributes = JSON.stringify({ name: fileName, parent: { id: parentId || '0' } });
  const boundary = '---cloudshelve_box_boundary';

  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="attributes"\r\n\r\n`),
    Buffer.from(attributes),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const resp = await fetch('https://upload.box.com/api/2.0/files/content', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: multipart,
  });
  if (!resp.ok) throw new Error(`Box upload failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return mapBoxItem(data.entries?.[0] || data);
}

async function downloadBoxFile(accessToken: string, fileId: string, fileName: string): Promise<DownloadResult> {
  // Box /content returns a 302 redirect; fetch follows automatically
  const resp = await fetch(`https://api.box.com/2.0/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Box download failed: ${resp.status} ${await resp.text()}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get('content-type') || 'application/octet-stream';
  return { buffer, contentType, fileName };
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

// ═══════════════════════════════════════════════════════════════════════════════
// MEGA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Open a megajs Storage session and call `fn` with it, then close.
 * `credentialsJson` is a JSON string containing `{ email, password }`.
 */
function withMegaStorage<T>(
  credentialsJson: string,
  fn: (storage: any) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const { email, password } = JSON.parse(credentialsJson);
    const megajs = require('megajs');
    const Storage = megajs.Storage ?? megajs.default?.Storage ?? megajs;

    const storage = new Storage(
      { email, password, autologin: true, autoload: true },
      async (err: Error | null) => {
        if (err) return reject(new Error('MEGA login failed: ' + err.message));
        try {
          const result = await fn(storage);
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          try { storage.close(); } catch { /* ignore */ }
        }
      },
    );

    setTimeout(() => reject(new Error('MEGA login timeout')), 20_000);
  });
}

function mapMegaNode(node: any, parentId: string | null): FileItem {
  const isFolder = node.directory === true || node.type === 1;
  return {
    id: node.nodeId,
    name: node.name ?? '(unnamed)',
    kind: isFolder ? 'folder' : 'file',
    mimeType: isFolder ? null : 'application/octet-stream',
    size: isFolder ? null : (node.size ?? null),
    modifiedAt: node.timestamp ? new Date(node.timestamp * 1000).toISOString() : null,
    thumbnailUrl: null,
    downloadUrl: null,
    path: null,
    parentId,
  };
}

async function listMegaFiles(
  credentialsJson: string,
  folderId: string | null,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  return withMegaStorage(credentialsJson, async (storage) => {
    let parent: any;
    if (folderId) {
      parent = storage.files[folderId];
      if (!parent) throw new Error('Folder not found');
    } else {
      parent = storage.root;
    }

    const children: any[] = parent.children ?? [];
    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    const page = children.slice(offset, offset + pageSize);
    const nextOffset = offset + page.length;
    const nextPageToken = nextOffset < children.length ? String(nextOffset) : null;

    return {
      items: page.map((n: any) => mapMegaNode(n, folderId)),
      nextPageToken,
    };
  });
}

async function searchMegaFiles(
  credentialsJson: string,
  query: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const lq = query.toLowerCase();
    const all: any[] = Object.values(storage.files).filter(
      (n: any) => n.name && n.name.toLowerCase().includes(lq),
    );

    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    const page = all.slice(offset, offset + pageSize);
    const nextOffset = offset + page.length;
    const nextPageToken = nextOffset < all.length ? String(nextOffset) : null;

    return {
      items: page.map((n: any) => mapMegaNode(n, n.parent?.nodeId ?? null)),
      nextPageToken,
    };
  });
}

async function createMegaFolder(
  credentialsJson: string,
  parentId: string | null,
  name: string,
): Promise<FileItem> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const parent = parentId ? storage.files[parentId] : storage.root;
    if (!parent) throw new Error('Parent folder not found');

    const newFolder = await new Promise<any>((res, rej) => {
      parent.mkdir(name, (err: Error | null, folder: any) => {
        if (err) return rej(err);
        res(folder);
      });
    });

    return mapMegaNode(newFolder, parentId);
  });
}

async function deleteMegaFile(
  credentialsJson: string,
  fileId: string,
): Promise<void> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const node = storage.files[fileId];
    if (!node) throw new Error('File not found');
    await new Promise<void>((res, rej) => {
      node.delete(false, (err: Error | null) => {
        if (err) return rej(err);
        res();
      });
    });
  });
}

async function renameMegaFile(
  credentialsJson: string,
  fileId: string,
  newName: string,
): Promise<FileItem> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const node = storage.files[fileId];
    if (!node) throw new Error('File not found');
    await new Promise<void>((res, rej) => {
      node.rename(newName, (err: Error | null) => {
        if (err) return rej(err);
        res();
      });
    });
    return mapMegaNode(node, node.parent?.nodeId ?? null);
  });
}

async function uploadMegaFile(
  credentialsJson: string,
  parentId: string | null,
  fileName: string,
  buffer: Buffer,
): Promise<FileItem> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const parent = parentId ? storage.files[parentId] : storage.root;
    if (!parent) throw new Error('Parent folder not found');

    const uploadStream = parent.upload({ name: fileName, size: buffer.length }, buffer);
    const uploaded: any = await uploadStream.complete;
    return mapMegaNode(uploaded, parentId);
  });
}

async function downloadMegaFile(
  credentialsJson: string,
  fileId: string,
  fileName: string,
): Promise<DownloadResult> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const node = storage.files[fileId];
    if (!node) throw new Error('File not found');

    const buffer: Buffer = await new Promise((res, rej) => {
      node.downloadBuffer({}, (err: Error | null, data: Buffer) => {
        if (err) return rej(err);
        res(data);
      });
    });

    return {
      buffer,
      contentType: 'application/octet-stream',
      fileName,
    };
  });
}
