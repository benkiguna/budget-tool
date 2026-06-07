import { db } from './index.js';

// ── Local Backup ──────────────────────────────────────────────────────────────

export async function downloadLocalBackup() {
  const blob = await db.exportBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${new Date().toISOString().slice(0, 10)}.db`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreFromFile(file) {
  const buffer = await file.arrayBuffer();
  await db.importBuffer(buffer);
  window.location.reload();
}

// ── Google Drive Sync (direct from browser, no server proxy) ──────────────────

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const FILE_NAME = 'budget-database.db';

async function getAccessToken() {
  const res = await fetch('/auth/token');
  if (!res.ok) throw new Error('Not authenticated');
  const { access_token } = await res.json();
  return access_token;
}

async function findExistingFileId(token) {
  const res = await fetch(
    `${DRIVE_FILES_URL}?spaces=appDataFolder&q=name='${FILE_NAME}'&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const { files } = await res.json();
  return files?.[0]?.id ?? null;
}

export async function syncToDrive() {
  const token = await getAccessToken();
  const blob = await db.exportBlob();
  const existingId = await findExistingFileId(token);

  const metadata = {
    name: FILE_NAME,
    ...(existingId ? {} : { parents: ['appDataFolder'] }),
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = existingId
    ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.statusText}`);
}

export async function syncFromDrive() {
  const token = await getAccessToken();
  const fileId = await findExistingFileId(token);
  if (!fileId) throw new Error('No backup found in Drive');

  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.statusText}`);

  const buffer = await res.arrayBuffer();
  await db.importBuffer(buffer);
  window.location.reload();
}
