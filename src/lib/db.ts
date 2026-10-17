import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { NoteRecord, Settings, VaultHeader } from './types';

interface PlainNoteDB extends DBSchema {
  vault: {
    key: string;
    value: VaultHeader | Settings | FileSystemDirectoryHandle | string;
  };
  notes: {
    key: string;
    value: NoteRecord;
  };
}

export const KEY_HEADER = 'header';
export const KEY_SETTINGS = 'settings';
export const KEY_SYNC_HANDLE = 'syncHandle';
export const KEY_SYNC_PATH = 'syncPath';

let dbPromise: Promise<IDBPDatabase<PlainNoteDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<PlainNoteDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PlainNoteDB>('plain-note', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function getVaultValue<T>(key: string): Promise<T | undefined> {
  return (await getDb()).get('vault', key) as Promise<T | undefined>;
}

export async function setVaultValue(key: string, value: VaultHeader | Settings | FileSystemDirectoryHandle | string): Promise<void> {
  await (await getDb()).put('vault', value, key);
}

export async function deleteVaultValue(key: string): Promise<void> {
  await (await getDb()).delete('vault', key);
}

export async function getAllNotes(): Promise<NoteRecord[]> {
  return (await getDb()).getAll('notes');
}

export async function putNote(record: NoteRecord): Promise<void> {
  await (await getDb()).put('notes', record);
}

export async function deleteNoteRecord(id: string): Promise<void> {
  await (await getDb()).delete('notes', id);
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear('notes');
  await db.clear('vault');
}
