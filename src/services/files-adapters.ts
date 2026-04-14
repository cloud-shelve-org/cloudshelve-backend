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

// ─── Stream helpers ───────────────────────────────────────────────────────────

function bufferToStream(buf: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) { controller.enqueue(buf); controller.close(); },
  });
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export interface DownloadStreamResult {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  fileName: string;
  /** Byte count from Content-Length header; 0 if unknown. */
  size: number;
}

/**
 * Like downloadFile but returns a streaming body instead of a full Buffer.
 * Use in background workers to avoid loading large files into memory.
 */
export async function downloadFileStream(
  providerType: ProviderType,
  accessToken: string,
  fileId: string,
  fileName: string,
  filePath?: string | null,
): Promise<DownloadStreamResult> {
  switch (providerType) {
    case 'google_drive': return streamDownloadGoogleDrive(accessToken, fileId, fileName);
    case 'onedrive':     return streamDownloadOneDrive(accessToken, fileId, fileName);
    case 'dropbox':      return streamDownloadDropbox(accessToken, filePath || fileId, fileName);
    case 'box':          return streamDownloadBox(accessToken, fileId, fileName);
    case 'mega': {
      const { buffer, contentType, fileName: fn } = await downloadMegaFile(accessToken, fileId, fileName);
      return { stream: bufferToStream(buffer), contentType, fileName: fn, size: buffer.length };
    }
    default: throw new Error(`Streaming download not supported for ${providerType}`);
  }
}

/**
 * Like uploadFile but accepts a ReadableStream instead of a Buffer.
 * Pair with downloadFileStream for memory-efficient large-file transfers.
 */
export async function uploadFileStream(
  providerType: ProviderType,
  accessToken: string,
  parentId: string | null,
  fileName: string,
  mimeType: string,
  stream: ReadableStream<Uint8Array>,
  size: number,
): Promise<FileItem> {
  switch (providerType) {
    case 'google_drive': return streamUploadGoogleDrive(accessToken, parentId, fileName, mimeType, stream, size);
    case 'onedrive':     return streamUploadOneDrive(accessToken, parentId, fileName, mimeType, stream, size);
    case 'dropbox':      return streamUploadDropbox(accessToken, parentId, fileName, stream);
    case 'box': {
      const buf = await streamToBuffer(stream);
      return uploadBoxFile(accessToken, parentId, fileName, mimeType, buf);
    }
    case 'mega': {
      // If we know the file size, stream directly to MEGA (no RAM buffer).
      // megajs upload() returns a Writable; pipe a Node.js Readable to it.
      // Fallback to buffer only when size is unknown (size === 0).
      if (size > 0) {
        return streamUploadMega(accessToken, parentId, fileName, stream, size);
      }
      const buf = await streamToBuffer(stream);
      return uploadMegaFile(accessToken, parentId, fileName, buf);
    }
    default: throw new Error(`Streaming upload not supported for ${providerType}`);
  }
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
  // orderBy is not permitted with fullText queries in Drive v3 — the API
  // returns results in relevance order automatically when fullText is used.
  const params = new URLSearchParams({
    q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
    fields: GDRIVE_FIELDS,
    pageSize: String(pageSize),
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
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

// ─── Google Drive streaming ───────────────────────────────────────────────────

async function streamDownloadGoogleDrive(
  accessToken: string, fileId: string, fileName: string,
): Promise<DownloadStreamResult> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
    { headers },
  );
  if (resp.ok && resp.body) {
    return {
      stream: resp.body,
      contentType: resp.headers.get('content-type') || 'application/octet-stream',
      fileName,
      size: parseInt(resp.headers.get('content-length') || '0', 10),
    };
  }
  // Workspace file (e.g. Google Docs) — fall back to export buffer (typically small)
  const { buffer, contentType, fileName: fn } = await downloadGoogleDriveFile(accessToken, fileId, fileName);
  return { stream: bufferToStream(buffer), contentType, fileName: fn, size: buffer.length };
}

async function streamUploadGoogleDrive(
  accessToken: string, parentId: string | null, fileName: string,
  mimeType: string, stream: ReadableStream<Uint8Array>, size: number,
): Promise<FileItem> {
  const initHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Upload-Content-Type': mimeType,
  };
  if (size > 0) initHeaders['X-Upload-Content-Length'] = String(size);

  const initResp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${GDRIVE_FILE_FIELDS}`,
    { method: 'POST', headers: initHeaders, body: JSON.stringify({ name: fileName, parents: [parentId || 'root'] }) },
  );
  if (!initResp.ok) throw new Error(`Google Drive resumable init failed: ${await initResp.text()}`);
  const uploadUrl = initResp.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive: missing resumable upload Location header');

  const putHeaders: Record<string, string> = { 'Content-Type': mimeType };
  if (size > 0) putHeaders['Content-Length'] = String(size);

  const putResp = await fetch(uploadUrl, {
    method: 'PUT', headers: putHeaders, body: stream,
    ...({ duplex: 'half' } as any),
  });
  if (!putResp.ok) throw new Error(`Google Drive upload failed: ${await putResp.text()}`);
  return mapGoogleDriveItem(await putResp.json());
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

// ─── OneDrive streaming ───────────────────────────────────────────────────────

async function streamDownloadOneDrive(
  accessToken: string, fileId: string, fileName: string,
): Promise<DownloadStreamResult> {
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`OneDrive download failed: ${resp.status} ${await resp.text()}`);
  return {
    stream: resp.body!,
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
    fileName,
    size: parseInt(resp.headers.get('content-length') || '0', 10),
  };
}

async function streamUploadOneDrive(
  accessToken: string, parentId: string | null, fileName: string,
  mimeType: string, stream: ReadableStream<Uint8Array>, size: number,
): Promise<FileItem> {
  const url = parentId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(fileName)}:/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`;
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType };
  if (size > 0) headers['Content-Length'] = String(size);
  const resp = await fetch(url, {
    method: 'PUT', headers, body: stream,
    ...({ duplex: 'half' } as any),
  });
  if (!resp.ok) throw new Error(`OneDrive upload failed: ${await resp.text()}`);
  return mapOneDriveItem(await resp.json());
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

// ─── Dropbox streaming ────────────────────────────────────────────────────────

async function streamDownloadDropbox(
  accessToken: string, filePath: string, fileName: string,
): Promise<DownloadStreamResult> {
  const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
      'Content-Type': 'text/plain; charset=dropbox-cors-hack',
    },
  });
  if (!resp.ok) throw new Error(`Dropbox download failed: ${resp.status} ${await resp.text()}`);
  return {
    stream: resp.body!,
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
    fileName,
    size: parseInt(resp.headers.get('content-length') || '0', 10),
  };
}

async function streamUploadDropbox(
  accessToken: string, parentId: string | null, fileName: string,
  stream: ReadableStream<Uint8Array>,
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
    body: stream,
    ...({ duplex: 'half' } as any),
  });
  if (!resp.ok) throw new Error(`Dropbox upload failed: ${await resp.text()}`);
  return mapDropboxItem(await resp.json());
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

// ─── Box streaming ────────────────────────────────────────────────────────────

async function streamDownloadBox(
  accessToken: string, fileId: string, fileName: string,
): Promise<DownloadStreamResult> {
  const resp = await fetch(`https://api.box.com/2.0/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Box download failed: ${resp.status} ${await resp.text()}`);
  return {
    stream: resp.body!,
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
    fileName,
    size: parseInt(resp.headers.get('content-length') || '0', 10),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEGA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Module-level MEGA session pool.
 *
 * MEGA login (autologin + autoload of the full file tree) can take 20–60 s on
 * large accounts.  We cache the open Storage promise keyed by the raw credentials
 * JSON so that every subsequent adapter call within the same process reuses the
 * same session — login happens exactly once per set of credentials.
 *
 * If login fails or times out the promise is removed so the next call retries.
 */
const _megaSessionCache = new Map<string, Promise<any>>();

function acquireMegaSession(credentialsJson: string): Promise<any> {
  const cached = _megaSessionCache.get(credentialsJson);
  if (cached) return cached;

  const promise = new Promise<any>((resolve, reject) => {
    const { email, password } = JSON.parse(credentialsJson);
    const megajs = require('megajs');
    const Storage = megajs.Storage ?? megajs.default?.Storage ?? megajs;

    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    // 90 s login timeout — large accounts need time to load the full file tree.
    const timer = setTimeout(() => {
      _megaSessionCache.delete(credentialsJson); // allow retry
      settle(() => reject(new Error('MEGA login timeout')));
    }, 90_000);

    const storage = new Storage(
      { email, password, autologin: true, autoload: true },
      (err: Error | null) => {
        clearTimeout(timer);
        if (err) {
          _megaSessionCache.delete(credentialsJson);
          return settle(() => reject(new Error('MEGA login failed: ' + err.message)));
        }
        settle(() => resolve(storage));
      },
    );
  });

  _megaSessionCache.set(credentialsJson, promise);
  // Remove failed entries so callers can retry
  promise.catch(() => _megaSessionCache.delete(credentialsJson));
  return promise;
}

/**
 * Run `fn` with an open megajs Storage session for the given credentials.
 * The session is kept alive and reused across calls (no per-call login).
 */
async function withMegaStorage<T>(
  credentialsJson: string,
  fn: (storage: any) => Promise<T>,
): Promise<T> {
  const storage = await acquireMegaSession(credentialsJson);
  return fn(storage);
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

/**
 * Stream-upload to MEGA without buffering the entire file in RAM.
 *
 * megajs upload() returns a Node.js Writable stream; we convert the incoming
 * Web ReadableStream to a Node.js Readable via Readable.fromWeb() and pipe it.
 * The `size` must be known so MEGA can pre-initialise its AES-CTR cipher header
 * (MEGA requires exact file size before the upload begins).
 */
async function streamUploadMega(
  credentialsJson: string,
  parentId: string | null,
  fileName: string,
  stream: ReadableStream<Uint8Array>,
  size: number,
): Promise<FileItem> {
  const { Readable } = require('stream') as typeof import('stream');
  // Convert Web ReadableStream → Node.js Readable (Node ≥ 17 / our target ≥ 20)
  const nodeReadable = Readable.fromWeb(stream as any);

  return withMegaStorage(credentialsJson, async (storage) => {
    const parent = parentId ? storage.files[parentId] : storage.root;
    if (!parent) throw new Error('Parent folder not found');

    // upload() without a second argument returns a Writable we pipe into.
    // uploadStream.complete is a Promise<MegaFile> that resolves on success.
    const uploadStream = parent.upload({ name: fileName, size });

    // Surface upload errors on the nodeReadable side as well
    const uploadComplete: Promise<any> = uploadStream.complete;

    nodeReadable.pipe(uploadStream);

    const uploaded = await uploadComplete;
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

// ─── File index (duplicate-finder metadata harvest) ───────────────────────────
//
// Each provider returns all files with whatever native hash it exposes.
// No file content ever leaves the provider — only metadata.
// The mobile client performs the actual duplicate comparison in memory.

export type IndexHashAlgo =
  | 'md5'                // Google Drive
  | 'sha1'               // Box (hex)
  | 'sha1_base64'        // OneDrive SHA1 (base64-encoded; client normalises to hex)
  | 'dropboxContentHash' // Dropbox proprietary multi-block SHA-256
  | 'quickXorHash';      // OneDrive proprietary (usable only within same-provider)

export interface FileIndexEntry {
  id:             string;
  name:           string;
  path:           string;   // full provider path when available; filename otherwise
  size:           number;   // bytes
  mimeType:       string;
  nativeHash?:    string;
  nativeHashAlgo?:IndexHashAlgo;
  modifiedAt:     string;   // ISO-8601
}

export interface IndexFilesResult {
  files:         FileIndexEntry[];
  nextPageToken: string | null;
  totalFetched:  number;
}

/** Dispatcher — returns a page of all files (recursively) with hash metadata. */
export async function indexFiles(
  providerType: ProviderType,
  accessToken: string,
  pageToken: string | null,
  maxPerPage: number,
): Promise<IndexFilesResult> {
  switch (providerType) {
    case 'google_drive': return indexGoogleDriveFiles(accessToken, pageToken, maxPerPage);
    case 'onedrive':     return indexOneDriveFiles(accessToken, pageToken, maxPerPage);
    case 'dropbox':      return indexDropboxFiles(accessToken, pageToken, maxPerPage);
    case 'box':          return indexBoxFiles(accessToken, pageToken, maxPerPage);
    case 'mega':         return indexMegaFiles(accessToken, pageToken, maxPerPage);
    default: throw new Error(`File indexing not supported for ${providerType}`);
  }
}

// ── Google Drive ──────────────────────────────────────────────────────────────
// Lists ALL non-trashed, non-folder files in one shot (no parent filter).
// md5Checksum is returned for user-uploaded files; Google Workspace files
// (Docs, Sheets, Slides) have no size/hash and are filtered out.

async function indexGoogleDriveFiles(
  accessToken: string,
  pageToken: string | null,
  maxPerPage: number,
): Promise<IndexFilesResult> {
  const params = new URLSearchParams({
    fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)',
    q: "trashed=false and mimeType!='application/vnd.google-apps.folder'",
    pageSize: String(Math.min(maxPerPage, 1000)),
    spaces: 'drive',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Drive index error ${res.status}`);
  const data: any = await res.json();

  const files: FileIndexEntry[] = (data.files ?? [])
    .filter((f: any) => f.size && !f.mimeType?.startsWith('application/vnd.google-apps'))
    .map((f: any) => ({
      id:             f.id,
      name:           f.name,
      path:           f.name,   // full-path reconstruction needs extra calls; filename is enough for MVP
      size:           parseInt(f.size, 10),
      mimeType:       f.mimeType ?? 'application/octet-stream',
      nativeHash:     f.md5Checksum,
      nativeHashAlgo: f.md5Checksum ? 'md5' as const : undefined,
      modifiedAt:     f.modifiedTime,
    }));

  return { files, nextPageToken: data.nextPageToken ?? null, totalFetched: files.length };
}

// ── OneDrive ──────────────────────────────────────────────────────────────────
// Uses the /delta endpoint which efficiently streams the full file tree.
// The nextPageToken IS the @odata.nextLink URL (full URL, safe to pass opaquely).

async function indexOneDriveFiles(
  accessToken: string,
  pageToken: string | null,
  maxPerPage: number,
): Promise<IndexFilesResult> {
  const url = pageToken
    ?? `https://graph.microsoft.com/v1.0/me/drive/root/delta?$select=id,name,file,size,lastModifiedDateTime,parentReference&$top=${Math.min(maxPerPage, 1000)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`OneDrive index error ${res.status}`);
  const data: any = await res.json();

  const files: FileIndexEntry[] = (data.value ?? [])
    .filter((item: any) => item.file && !item.deleted)
    .map((item: any) => {
      const parentPath: string = item.parentReference?.path?.replace('/drive/root:', '') ?? '';
      const hash = item.file?.hashes?.sha1Hash;
      return {
        id:             item.id,
        name:           item.name,
        path:           parentPath ? `${parentPath}/${item.name}` : `/${item.name}`,
        size:           item.size ?? 0,
        mimeType:       item.file?.mimeType ?? 'application/octet-stream',
        nativeHash:     hash,
        nativeHashAlgo: hash ? 'sha1_base64' as const : undefined,
        modifiedAt:     item.lastModifiedDateTime,
      };
    });

  // nextLink = more pages; deltaLink = fully caught up (done for now)
  const nextLink: string | undefined = data['@odata.nextLink'];
  return { files, nextPageToken: nextLink ?? null, totalFetched: files.length };
}

// ── Dropbox ───────────────────────────────────────────────────────────────────
// list_folder with recursive:true returns the full tree in one cursor stream.
// The cursor IS the pageToken — pass it to list_folder/continue on subsequent calls.

async function indexDropboxFiles(
  accessToken: string,
  pageToken: string | null,
  maxPerPage: number,
): Promise<IndexFilesResult> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  let data: any;
  if (pageToken) {
    const res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST', headers,
      body: JSON.stringify({ cursor: pageToken }),
    });
    if (!res.ok) throw new Error(`Dropbox index continue error ${res.status}`);
    data = await res.json();
  } else {
    const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST', headers,
      body: JSON.stringify({
        path: '', recursive: true,
        include_media_info: false, include_deleted: false,
        limit: Math.min(maxPerPage, 2000),
      }),
    });
    if (!res.ok) throw new Error(`Dropbox index error ${res.status}`);
    data = await res.json();
  }

  const files: FileIndexEntry[] = (data.entries ?? [])
    .filter((e: any) => e['.tag'] === 'file')
    .map((e: any) => ({
      id:             e.id,
      name:           e.name,
      path:           e.path_display ?? e.name,
      size:           e.size,
      mimeType:       'application/octet-stream',
      nativeHash:     e.content_hash,
      nativeHashAlgo: e.content_hash ? 'dropboxContentHash' as const : undefined,
      modifiedAt:     e.client_modified,
    }));

  const nextPageToken = data.has_more ? (data.cursor ?? null) : null;
  return { files, nextPageToken, totalFetched: files.length };
}

// ── Box ───────────────────────────────────────────────────────────────────────
// BFS folder traversal encoded in the cursor as base64 JSON.
// cursor shape: { queue: string[], current: string, offset: number }

interface BoxCursor { queue: string[]; current: string; offset: number }

async function indexBoxFiles(
  accessToken: string,
  pageToken: string | null,
  maxPerPage: number,
): Promise<IndexFilesResult> {
  const PAGE = Math.min(maxPerPage, 200);
  const headers = { Authorization: `Bearer ${accessToken}` };

  let cursor: BoxCursor;
  try {
    cursor = pageToken
      ? JSON.parse(Buffer.from(pageToken, 'base64url').toString())
      : { queue: [], current: '0', offset: 0 };
  } catch {
    cursor = { queue: [], current: '0', offset: 0 };
  }

  const files: FileIndexEntry[] = [];
  let bail = false;

  while (!bail && files.length < maxPerPage) {
    const res = await fetch(
      `https://api.box.com/2.0/folders/${cursor.current}/items` +
      `?fields=id,name,sha1,size,modified_at,type&limit=${PAGE}&offset=${cursor.offset}`,
      { headers },
    );
    if (!res.ok) break;
    const data: any = await res.json();
    const entries: any[] = data.entries ?? [];

    for (const e of entries) {
      if (e.type === 'file') {
        files.push({
          id:             e.id,
          name:           e.name,
          path:           `/${e.name}`,
          size:           e.size ?? 0,
          mimeType:       'application/octet-stream',
          nativeHash:     e.sha1,
          nativeHashAlgo: e.sha1 ? 'sha1' as const : undefined,
          modifiedAt:     e.modified_at,
        });
      } else if (e.type === 'folder') {
        cursor.queue.push(e.id);
      }
    }

    const fetched = entries.length;
    const total: number = data.total_count ?? 0;
    cursor.offset += fetched;

    if (cursor.offset >= total) {
      if (cursor.queue.length === 0) { bail = true; break; }
      cursor.current = cursor.queue.shift()!;
      cursor.offset  = 0;
    }
  }

  const hasMore = !bail;
  const nextPageToken = hasMore ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
  return { files, nextPageToken, totalFetched: files.length };
}

// ── MEGA ──────────────────────────────────────────────────────────────────────
// MEGA does not expose file hashes via the API.  We return size + path only;
// the client uses size + filename for same-MEGA duplicate detection (confidence: high).

async function indexMegaFiles(
  credentialsJson: string,
  pageToken: string | null,
  maxPerPage: number,
): Promise<IndexFilesResult> {
  return withMegaStorage(credentialsJson, async (storage: any) => {
    const allFiles: FileIndexEntry[] = [];

    function traverse(node: any, parentPath: string) {
      for (const child of Object.values(node.children ?? {}) as any[]) {
        const childPath = `${parentPath}/${child.name}`;
        if (child.directory) {
          traverse(child, childPath);
        } else if (child.size > 0) {
          allFiles.push({
            id:        child.nodeId ?? child.name,
            name:      child.name,
            path:      childPath,
            size:      child.size,
            mimeType:  'application/octet-stream',
            modifiedAt: child.timestamp
              ? new Date(child.timestamp * 1000).toISOString()
              : new Date().toISOString(),
          });
        }
      }
    }

    traverse(storage.root, '');

    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    const page   = allFiles.slice(offset, offset + maxPerPage);
    const next   = offset + maxPerPage;
    return {
      files:         page,
      nextPageToken: next < allFiles.length ? String(next) : null,
      totalFetched:  page.length,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP ADAPTERS — large files, old files, trash
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Public dispatchers ───────────────────────────────────────────────────────

export async function listLargeFiles(
  providerType: ProviderType,
  accessToken: string,
  minSizeBytes: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  switch (providerType) {
    case 'google_drive': return cleanupGDriveLarge(accessToken, minSizeBytes, pageToken, pageSize);
    case 'onedrive':     return cleanupOneDriveLarge(accessToken, minSizeBytes, pageToken, pageSize);
    case 'dropbox':      return cleanupDropboxLarge(accessToken, minSizeBytes, pageToken, pageSize);
    case 'box':          return cleanupBoxLarge(accessToken, minSizeBytes, pageToken, pageSize);
    case 'mega':         return cleanupMegaLarge(accessToken, minSizeBytes, pageToken, pageSize);
    default: throw new Error(`Large-file listing not supported for ${providerType}`);
  }
}

export async function listOldFiles(
  providerType: ProviderType,
  accessToken: string,
  olderThanDays: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  switch (providerType) {
    case 'google_drive': return cleanupGDriveOld(accessToken, olderThanDays, pageToken, pageSize);
    case 'onedrive':     return cleanupOneDriveOld(accessToken, olderThanDays, pageToken, pageSize);
    case 'dropbox':      return cleanupDropboxOld(accessToken, olderThanDays, pageToken, pageSize);
    case 'box':          return cleanupBoxOld(accessToken, olderThanDays, pageToken, pageSize);
    case 'mega':         return cleanupMegaOld(accessToken, olderThanDays, pageToken, pageSize);
    default: throw new Error(`Old-file listing not supported for ${providerType}`);
  }
}

export async function listTrashFiles(
  providerType: ProviderType,
  accessToken: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  switch (providerType) {
    case 'google_drive': return cleanupGDriveTrash(accessToken, pageToken, pageSize);
    case 'dropbox':      return cleanupDropboxTrash(accessToken, pageToken, pageSize);
    case 'box':          return cleanupBoxTrash(accessToken, pageToken, pageSize);
    default: return { items: [], nextPageToken: null };
  }
}

export async function emptyProviderTrash(
  providerType: ProviderType,
  accessToken: string,
): Promise<void> {
  switch (providerType) {
    case 'google_drive': return cleanupGDriveEmptyTrash(accessToken);
    case 'box':          return cleanupBoxEmptyTrash(accessToken);
    default: throw new Error(`Empty trash not supported for ${providerType}`);
  }
}

/** True when the provider exposes a trash/recycle-bin via its API. */
export function providerSupportsTrash(providerType: ProviderType): boolean {
  return ['google_drive', 'dropbox', 'box'].includes(providerType);
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

async function cleanupGDriveLarge(
  accessToken: string,
  minSizeBytes: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const params = new URLSearchParams({
    q: `trashed = false and mimeType != '${GDRIVE_FOLDER_MIME}' and size > ${minSizeBytes}`,
    fields: GDRIVE_FIELDS,
    orderBy: 'quotaBytesUsed desc',
    pageSize: String(pageSize),
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    ...(pageToken ? { pageToken } : {}),
  });
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Google Drive large files failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return { items: (data.files || []).map(mapGoogleDriveItem), nextPageToken: data.nextPageToken || null };
}

async function cleanupGDriveOld(
  accessToken: string,
  olderThanDays: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const params = new URLSearchParams({
    q: `trashed = false and mimeType != '${GDRIVE_FOLDER_MIME}' and modifiedTime < '${cutoff}'`,
    fields: GDRIVE_FIELDS,
    orderBy: 'modifiedTime',
    pageSize: String(pageSize),
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    ...(pageToken ? { pageToken } : {}),
  });
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Google Drive old files failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return { items: (data.files || []).map(mapGoogleDriveItem), nextPageToken: data.nextPageToken || null };
}

async function cleanupGDriveTrash(
  accessToken: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const params = new URLSearchParams({
    q: 'trashed = true',
    fields: GDRIVE_FIELDS,
    pageSize: String(pageSize),
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    ...(pageToken ? { pageToken } : {}),
  });
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Google Drive trash list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  return { items: (data.files || []).map(mapGoogleDriveItem), nextPageToken: data.nextPageToken || null };
}

async function cleanupGDriveEmptyTrash(accessToken: string): Promise<void> {
  const resp = await fetch('https://www.googleapis.com/drive/v3/files/trash', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 204 No Content is the success response
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`Google Drive empty trash failed: ${await resp.text()}`);
  }
}

// ─── OneDrive ─────────────────────────────────────────────────────────────────

const ONEDRIVE_SEARCH_FIELDS =
  'id,name,size,lastModifiedDateTime,file,folder,parentReference,@microsoft.graph.downloadUrl';

async function cleanupOneDriveLarge(
  accessToken: string,
  minSizeBytes: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const params = new URLSearchParams({
    '$top': String(pageSize),
    '$orderby': 'size desc',
    '$select': ONEDRIVE_SEARCH_FIELDS,
    ...(pageToken ? { '$skiptoken': pageToken } : {}),
  });
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='')/?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`OneDrive large files failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const items = (data.value || [])
    .map(mapOneDriveItem)
    .filter((f: FileItem) => f.kind === 'file' && (f.size ?? 0) >= minSizeBytes);
  const nextLink: string | null = data['@odata.nextLink'] || null;
  const nextPageToken = nextLink ? (new URL(nextLink).searchParams.get('$skiptoken') ?? null) : null;
  return { items, nextPageToken };
}

async function cleanupOneDriveOld(
  accessToken: string,
  olderThanDays: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const params = new URLSearchParams({
    '$top': String(pageSize),
    '$orderby': 'lastModifiedDateTime asc',
    '$select': ONEDRIVE_SEARCH_FIELDS,
    ...(pageToken ? { '$skiptoken': pageToken } : {}),
  });
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='')/?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`OneDrive old files failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const items = (data.value || [])
    .map(mapOneDriveItem)
    .filter((f: FileItem) =>
      f.kind === 'file' && f.modifiedAt != null && f.modifiedAt < cutoff,
    );
  const nextLink: string | null = data['@odata.nextLink'] || null;
  const nextPageToken = nextLink ? (new URL(nextLink).searchParams.get('$skiptoken') ?? null) : null;
  return { items, nextPageToken };
}

// ─── Dropbox ──────────────────────────────────────────────────────────────────

async function cleanupDropboxLarge(
  accessToken: string,
  minSizeBytes: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  // Dropbox doesn't support server-side size sort; list root and sort client-side
  const { items, nextPageToken } = await listDropboxFiles(accessToken, null, pageToken, Math.min(pageSize * 3, 200));
  const filtered = items
    .filter((f) => f.kind === 'file' && (f.size ?? 0) >= minSizeBytes)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, pageSize);
  return { items: filtered, nextPageToken };
}

async function cleanupDropboxOld(
  accessToken: string,
  olderThanDays: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const { items, nextPageToken } = await listDropboxFiles(accessToken, null, pageToken, Math.min(pageSize * 3, 200));
  const filtered = items
    .filter((f) => f.kind === 'file' && f.modifiedAt != null && f.modifiedAt < cutoff)
    .sort((a, b) => (a.modifiedAt ?? '').localeCompare(b.modifiedAt ?? ''))
    .slice(0, pageSize);
  return { items: filtered, nextPageToken };
}

async function cleanupDropboxTrash(
  accessToken: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const body: any = pageToken
    ? { cursor: pageToken }
    : { path: '', limit: pageSize, include_deleted: true, recursive: false };
  const url = pageToken
    ? 'https://api.dropboxapi.com/2/files/list_folder/continue'
    : 'https://api.dropboxapi.com/2/files/list_folder';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Dropbox trash list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  // Only entries with .tag === 'deleted'
  const items = (data.entries || [])
    .filter((e: any) => e['.tag'] === 'deleted')
    .map(mapDropboxItem);
  return { items, nextPageToken: data.has_more ? data.cursor : null };
}

// ─── Box ──────────────────────────────────────────────────────────────────────

async function cleanupBoxLarge(
  accessToken: string,
  minSizeBytes: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({
    fields: 'id,name,type,size,modified_at,parent',
    limit:  String(pageSize),
    offset: String(offset),
    sort:   'size',
    direction: 'DESC',
  });
  const resp = await fetch(
    `https://api.box.com/2.0/folders/0/items?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Box large files failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const items = (data.entries || [])
    .map(mapBoxItem)
    .filter((f: FileItem) => f.kind === 'file' && (f.size ?? 0) >= minSizeBytes);
  const nextOffset = offset + (data.entries?.length || 0);
  const nextPageToken = nextOffset < (data.total_count || 0) ? String(nextOffset) : null;
  return { items, nextPageToken };
}

async function cleanupBoxOld(
  accessToken: string,
  olderThanDays: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({
    fields: 'id,name,type,size,modified_at,parent',
    limit:  String(pageSize),
    offset: String(offset),
    sort:   'date',
    direction: 'ASC',
  });
  const resp = await fetch(
    `https://api.box.com/2.0/folders/0/items?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Box old files failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const items = (data.entries || [])
    .map(mapBoxItem)
    .filter((f: FileItem) =>
      f.kind === 'file' && f.modifiedAt != null && f.modifiedAt < cutoff,
    );
  const nextOffset = offset + (data.entries?.length || 0);
  const nextPageToken = nextOffset < (data.total_count || 0) ? String(nextOffset) : null;
  return { items, nextPageToken };
}

async function cleanupBoxTrash(
  accessToken: string,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  const offset = pageToken ? parseInt(pageToken, 10) : 0;
  const params = new URLSearchParams({
    fields: 'id,name,type,size,content_modified_at,parent',
    limit:  String(pageSize),
    offset: String(offset),
  });
  const resp = await fetch(
    `https://api.box.com/2.0/folders/trash/items?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Box trash list failed: ${await resp.text()}`);
  const data: any = await resp.json();
  const nextOffset = offset + (data.entries?.length || 0);
  const nextPageToken = nextOffset < (data.total_count || 0) ? String(nextOffset) : null;
  return { items: (data.entries || []).map(mapBoxItem), nextPageToken };
}

async function cleanupBoxEmptyTrash(accessToken: string): Promise<void> {
  const resp = await fetch('https://api.box.com/2.0/folders/trash', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`Box empty trash failed: ${await resp.text()}`);
  }
}

// ─── MEGA ─────────────────────────────────────────────────────────────────────

async function cleanupMegaLarge(
  credentialsJson: string,
  minSizeBytes: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const all: FileItem[] = (Object.values(storage.files) as any[])
      .filter((n) => !n.directory && (n.size ?? 0) >= minSizeBytes)
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .map((n) => mapMegaNode(n, n.parent?.nodeId ?? null));
    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    const page   = all.slice(offset, offset + pageSize);
    return {
      items: page,
      nextPageToken: offset + page.length < all.length ? String(offset + page.length) : null,
    };
  });
}

async function cleanupMegaOld(
  credentialsJson: string,
  olderThanDays: number,
  pageToken: string | null,
  pageSize: number,
): Promise<ListFilesResult> {
  return withMegaStorage(credentialsJson, async (storage) => {
    const cutoffMs = Date.now() - olderThanDays * 86_400_000;
    const all: FileItem[] = (Object.values(storage.files) as any[])
      .filter((n) => !n.directory && n.timestamp != null && n.timestamp * 1000 < cutoffMs)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map((n) => mapMegaNode(n, n.parent?.nodeId ?? null));
    const offset = pageToken ? parseInt(pageToken, 10) : 0;
    const page   = all.slice(offset, offset + pageSize);
    return {
      items: page,
      nextPageToken: offset + page.length < all.length ? String(offset + page.length) : null,
    };
  });
}
