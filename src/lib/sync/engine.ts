import { decryptJson, encryptJson } from '../crypto';
import type { Note, SyncResult, VaultHeader } from '../types';
import { Vault } from '../vault';
import { HEADER_FILE, NOTES_DIR, type SyncBackend } from './platform';

const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class FolderVaultMismatchError extends Error {
  constructor(readonly remoteHeader: VaultHeader) {
    super('This folder already holds a different vault.');
    this.name = 'FolderVaultMismatchError';
  }
}

export interface SyncProgress {
  (message: string): void;
}

function notePath(id: string): string {
  return `${NOTES_DIR}/${id}.enc`;
}

export async function readFolderHeader(backend: SyncBackend): Promise<VaultHeader | null> {
  const bytes = await backend.readFile(HEADER_FILE);
  if (!bytes) return null;
  try {
    return JSON.parse(decoder.decode(bytes)) as VaultHeader;
  } catch {
    return null;
  }
}

export async function writeFolderHeader(backend: SyncBackend, header: VaultHeader): Promise<void> {
  await backend.writeFile(HEADER_FILE, encoder.encode(JSON.stringify(header, null, 2)));
}

export async function syncVault(
  vault: Vault,
  backend: SyncBackend,
  onProgress?: SyncProgress,
): Promise<SyncResult> {
  onProgress?.('Preparing sync folder…');
  await backend.ensurePermission();
  await backend.ensure();

  let remoteHeader = await readFolderHeader(backend);
  if (remoteHeader) {
    if (remoteHeader.salt !== vault.header.salt) throw new FolderVaultMismatchError(remoteHeader);
  } else {
    remoteHeader = vault.header;
    await writeFolderHeader(backend, vault.header);
  }

  const remoteNames = await backend.listFiles(NOTES_DIR);
  const remoteIds = new Set<string>();
  let pulled = 0;
  let pushed = 0;
  let removed = 0;

  for (const name of remoteNames) {
    if (!name.endsWith('.enc')) continue;
    const id = name.slice(0, -'.enc'.length);
    remoteIds.add(id);
    const path = `${NOTES_DIR}/${name}`;
    const mtime = await backend.mtime(path);
    const local = vault.recordMeta(id);
    const needsRead = !local || local.remoteMtime === null || mtime > local.remoteMtime;
    if (!needsRead) continue;

    const bytes = await backend.readFile(path);
    if (!bytes) continue;
    onProgress?.(`Pulling ${id.slice(0, 8)}…`);
    let remoteNote: Note;
    try {
      remoteNote = await decryptJson<Note>(vault.key, bytes);
    } catch {
      continue; // Skip files we cannot decrypt (foreign or corrupt).
    }

    if (!local || remoteNote.updatedAt > local.updatedAt) {
      await vault.applyRemote(remoteNote, mtime);
      pulled += 1;
    } else if (local.remoteMtime !== mtime) {
      await vault.setRemoteMtime(id, mtime);
    }
  }

  onProgress?.('Pushing changes…');
  const now = Date.now();
  for (const meta of vault.recordMetas()) {
    const isOldTombstone =
      meta.deletedAt !== null && now - meta.deletedAt > TOMBSTONE_TTL;
    if (isOldTombstone) {
      await backend.removeFile(notePath(meta.id));
      await vault.purgeNote(meta.id);
      removed += 1;
      continue;
    }

    const missingRemotely = !remoteIds.has(meta.id);
    const wasSynced = meta.remoteMtime !== null;
    if (!meta.dirty && !(wasSynced && missingRemotely)) continue;

    const note = await vault.readRecordNote(meta.id);
    if (!note) continue;
    await backend.writeFile(notePath(note.id), await encryptJson(vault.key, note));
    const mtime = await backend.mtime(notePath(note.id));
    await vault.markPushed(note.id, mtime);
    pushed += 1;
  }

  onProgress?.('Sync complete');
  return { pulled, pushed, removed, at: Date.now() };
}

/** Replace this device's vault with the one already stored in the folder. */
export async function joinFolderVault(
  vault: Vault,
  backend: SyncBackend,
  passphrase: string,
  onProgress?: SyncProgress,
): Promise<void> {
  const remoteHeader = await readFolderHeader(backend);
  if (!remoteHeader) throw new Error('The chosen folder does not contain a Plain Note vault yet');
  onProgress?.('Re-keying local vault…');
  const adopted = await Vault.adoptHeader(remoteHeader, passphrase);
  await vault.rekey(adopted.header, adopted.key);
  await syncVault(vault, backend, onProgress);
}
