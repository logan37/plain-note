export interface Note {
  id: string;
  content: string;
  tags: string[];
  pinned: boolean;
  favourite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface VaultHeader {
  format: 1;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  cipher: 'AES-GCM';
  iterations: number;
  salt: string;
  createdAt: number;
}

export interface NoteRecord {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  dirty: boolean;
  remoteMtime: number | null;
  blob: Uint8Array;
}

export type NoteFilter =
  | { kind: 'all' }
  | { kind: 'favourites' }
  | { kind: 'tag'; tag: string };

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  syncEnabled: boolean;
  syncFolderLabel: string | null;
  autoSyncMinutes: number;
  lastSyncedAt: number | null;
  trustedUntil: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  syncEnabled: false,
  syncFolderLabel: null,
  autoSyncMinutes: 0,
  lastSyncedAt: null,
  trustedUntil: null,
};

export interface SyncResult {
  pulled: number;
  pushed: number;
  removed: number;
  at: number;
}
