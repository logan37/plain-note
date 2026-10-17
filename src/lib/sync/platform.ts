import {
  deleteVaultValue,
  getVaultValue,
  KEY_SYNC_HANDLE,
  KEY_SYNC_PATH,
  setVaultValue,
} from '../db';

export const HEADER_FILE = 'plainnote.vault';
export const NOTES_DIR = 'notes';

export interface SyncBackend {
  readonly kind: 'folder-browser' | 'folder-native';
  readonly label: string;
  ensure(): Promise<void>;
  ensurePermission(): Promise<void>;
  listFiles(dir: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  removeFile(path: string): Promise<void>;
  mtime(path: string): Promise<number>;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export function canUseSyncFolders(): boolean {
  if (isTauri()) return true;
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function joinPath(root: string, path: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '');
  return `${normalizedRoot}/${path}`;
}

class BrowserFolderBackend implements SyncBackend {
  readonly kind = 'folder-browser' as const;

  constructor(
    private root: FileSystemDirectoryHandle,
    readonly label: string,
  ) {}

  private async resolveDir(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const part of path.split('/').filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part, { create });
    }
    return dir;
  }

  private async resolveFile(
    path: string,
    create: boolean,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop() ?? '';
    const dir = await this.resolveDir(parts.join('/'), create);
    return { dir, name };
  }

  async ensure(): Promise<void> {
    await this.ensurePermission();
    await this.resolveDir(NOTES_DIR, true);
  }

  async ensurePermission(): Promise<void> {
    const opts = { mode: 'readwrite' as const };
    const current = (await this.root.queryPermission?.(opts)) ?? 'granted';
    if (current === 'granted') return;
    const next = (await this.root.requestPermission?.(opts)) ?? 'granted';
    if (next !== 'granted') throw new Error('Write permission for the sync folder was denied');
  }

  async listFiles(dir: string): Promise<string[]> {
    const handle = await this.resolveDir(dir, true);
    const names: string[] = [];
    for await (const [name, entry] of (handle as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      if (entry.kind === 'file') names.push(name);
    }
    return names;
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const { dir, name } = await this.resolveFile(path, false);
    try {
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { dir, name } = await this.resolveFile(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data as BufferSource);
    await writable.close();
  }

  async removeFile(path: string): Promise<void> {
    const { dir, name } = await this.resolveFile(path, false);
    try {
      await dir.removeEntry(name);
    } catch {
      /* already gone */
    }
  }

  async mtime(path: string): Promise<number> {
    const { dir, name } = await this.resolveFile(path, false);
    try {
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      return file.lastModified;
    } catch {
      return 0;
    }
  }
}

class NativeFolderBackend implements SyncBackend {
  readonly kind = 'folder-native' as const;

  constructor(
    private root: string,
    readonly label: string,
  ) {}

  private async fs() {
    return import('@tauri-apps/plugin-fs');
  }

  async ensure(): Promise<void> {
    const { mkdir } = await this.fs();
    await mkdir(this.root, { recursive: true });
    await mkdir(joinPath(this.root, NOTES_DIR), { recursive: true });
  }

  async ensurePermission(): Promise<void> {
    /* Native filesystem access is granted by the OS folder picker. */
  }

  async listFiles(dir: string): Promise<string[]> {
    const { readDir } = await this.fs();
    try {
      const entries = await readDir(joinPath(this.root, dir));
      return entries.filter((entry) => entry.isFile).map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const { readFile } = await this.fs();
    try {
      return await readFile(joinPath(this.root, path));
    } catch {
      return null;
    }
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { writeFile } = await this.fs();
    await writeFile(joinPath(this.root, path), data);
  }

  async removeFile(path: string): Promise<void> {
    const { remove } = await this.fs();
    try {
      await remove(joinPath(this.root, path));
    } catch {
      /* already gone */
    }
  }

  async mtime(path: string): Promise<number> {
    const { stat } = await this.fs();
    try {
      const info = await stat(joinPath(this.root, path));
      return info.mtime ? new Date(info.mtime).getTime() : 0;
    } catch {
      return 0;
    }
  }
}

export async function loadBackend(): Promise<SyncBackend | null> {
  if (isTauri()) {
    const path = await getVaultValue<string>(KEY_SYNC_PATH);
    if (!path) return null;
    return new NativeFolderBackend(path, path.split(/[\\/]/).pop() ?? path);
  }
  const handle = await getVaultValue<FileSystemDirectoryHandle>(KEY_SYNC_HANDLE);
  if (!handle) return null;
  return new BrowserFolderBackend(handle, handle.name);
}

export async function pickFolder(): Promise<SyncBackend | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false, title: 'Choose sync folder' });
    if (typeof selected !== 'string') return null;
    await setVaultValue(KEY_SYNC_PATH, selected);
    const backend = new NativeFolderBackend(selected, selected.split(/[\\/]/).pop() ?? selected);
    await backend.ensure();
    return backend;
  }
  if (!window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker({ id: 'plain-note-sync', mode: 'readwrite' });
  await setVaultValue(KEY_SYNC_HANDLE, handle);
  const backend = new BrowserFolderBackend(handle, handle.name);
  await backend.ensure();
  return backend;
}

export async function forgetFolder(): Promise<void> {
  if (isTauri()) {
    await deleteVaultValue(KEY_SYNC_PATH);
    return;
  }
  await deleteVaultValue(KEY_SYNC_HANDLE);
}
