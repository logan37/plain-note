import {
  KDF_ITERATIONS,
  SALT_BYTES,
  decryptJson,
  deriveKey,
  encryptJson,
  exportKeyRaw,
  fromBase64,
  importKeyRaw,
  randomBytes,
  toBase64,
} from './crypto';
import {
  clearAll,
  deleteNoteRecord,
  getAllNotes,
  getVaultValue,
  KEY_HEADER,
  putNote,
  setVaultValue,
} from './db';
import type { Note, NoteRecord, VaultHeader } from './types';

export function makeHeader(iterations: number = KDF_ITERATIONS): VaultHeader {
  return {
    format: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    cipher: 'AES-GCM',
    iterations,
    salt: toBase64(randomBytes(SALT_BYTES)),
    createdAt: Date.now(),
  };
}

export function newNote(content = ''): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    content,
    tags: [],
    pinned: false,
    favourite: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export interface VaultRecordMeta {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  dirty: boolean;
  remoteMtime: number | null;
}

export interface TrustedKey {
  key: string;
  salt: string;
  until: number;
}

const TRUST_PREFIX = 'plain-note:trust:';

export class Vault {
  header: VaultHeader;
  key: CryptoKey;
  notes = new Map<string, Note>();
  private meta = new Map<string, VaultRecordMeta>();
  private blobs = new Map<string, Uint8Array>();

  private constructor(header: VaultHeader, key: CryptoKey) {
    this.header = header;
    this.key = key;
  }

  static async exists(): Promise<boolean> {
    return Boolean(await getVaultValue<VaultHeader>(KEY_HEADER));
  }

  static async create(passphrase: string): Promise<Vault> {
    const header = makeHeader();
    const key = await deriveKey(passphrase, fromBase64(header.salt), header.iterations);
    const vault = new Vault(header, key);
    await setVaultValue(KEY_HEADER, header);
    return vault;
  }

  static async open(passphrase: string): Promise<Vault> {
    const header = await getVaultValue<VaultHeader>(KEY_HEADER);
    if (!header) throw new Error('No vault found on this device');
    const key = await deriveKey(passphrase, fromBase64(header.salt), header.iterations);
    const vault = new Vault(header, key);
    await vault.load();
    return vault;
  }

  static async openWithTrustedKey(trusted: TrustedKey): Promise<Vault | null> {
    const header = await getVaultValue<VaultHeader>(KEY_HEADER);
    if (!header || header.salt !== trusted.salt) return null;
    if (trusted.until < Date.now()) return null;
    const vault = new Vault(header, await importKeyRaw(fromBase64(trusted.key)));
    await vault.load();
    return vault;
  }

  /** Derive this device's key from a (folder) header so it can join an existing vault. */
  static async adoptHeader(header: VaultHeader, passphrase: string): Promise<Vault> {
    const key = await deriveKey(passphrase, fromBase64(header.salt), header.iterations);
    const vault = new Vault(header, key);
    return vault;
  }

  private async load(): Promise<void> {
    const records = await getAllNotes();
    const notes: Note[] = [];
    for (const record of records) {
      // Auth tag failure here means a wrong passphrase or a corrupt record.
      const note = await decryptJson<Note>(this.key, record.blob);
      this.blobs.set(record.id, record.blob);
      this.meta.set(record.id, {
        id: record.id,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt,
        dirty: record.dirty,
        remoteMtime: record.remoteMtime,
      });
      if (note.deletedAt === null) notes.push(note);
    }
    this.notes = new Map(notes.map((note) => [note.id, note]));
  }

  list(): Note[] {
    return [...this.notes.values()];
  }

  get(id: string): Note | undefined {
    return this.notes.get(id);
  }

  tags(): string[] {
    const set = new Set<string>();
    for (const note of this.notes.values()) for (const tag of note.tags) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  count(): number {
    return this.notes.size;
  }

  private async persist(note: Note): Promise<void> {
    const blob = await encryptJson(this.key, note);
    const previous = this.meta.get(note.id);
    const record: NoteRecord = {
      id: note.id,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      dirty: true,
      remoteMtime: previous?.remoteMtime ?? null,
      blob,
    };
    this.blobs.set(note.id, blob);
    this.meta.set(note.id, {
      id: note.id,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      dirty: true,
      remoteMtime: record.remoteMtime,
    });
    await putNote(record);
  }

  async createNote(content = ''): Promise<Note> {
    const note = newNote(content);
    this.notes.set(note.id, note);
    await this.persist(note);
    return note;
  }

  async updateNote(id: string, patch: Partial<Pick<Note, 'content' | 'pinned' | 'favourite' | 'tags'>>): Promise<Note> {
    const existing = this.notes.get(id);
    if (!existing) throw new Error('Note not found');
    const note: Note = { ...existing, ...patch, updatedAt: Date.now(), deletedAt: null };
    this.notes.set(id, note);
    await this.persist(note);
    return note;
  }

  async deleteNote(id: string): Promise<void> {
    const existing = this.notes.get(id);
    if (!existing) return;
    const tombstone: Note = { ...existing, content: '', updatedAt: Date.now(), deletedAt: Date.now() };
    this.notes.delete(id);
    await this.persist(tombstone);
  }

  async purgeNote(id: string): Promise<void> {
    this.notes.delete(id);
    this.meta.delete(id);
    this.blobs.delete(id);
    await deleteNoteRecord(id);
  }

  // --- Sync access ---------------------------------------------------------

  recordMetas(): VaultRecordMeta[] {
    return [...this.meta.values()];
  }

  recordMeta(id: string): VaultRecordMeta | undefined {
    return this.meta.get(id);
  }

  hasLocalNote(id: string): boolean {
    return this.notes.has(id);
  }

  async readRecordNote(id: string): Promise<Note | null> {
    const blob = this.blobs.get(id);
    if (!blob) return null;
    return decryptJson<Note>(this.key, blob);
  }

  /** Adopt a note that was newer in the sync folder. */
  async applyRemote(note: Note, remoteMtime: number): Promise<void> {
    const blob = await encryptJson(this.key, note);
    this.blobs.set(note.id, blob);
    this.meta.set(note.id, {
      id: note.id,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      dirty: false,
      remoteMtime,
    });
    if (note.deletedAt !== null) this.notes.delete(note.id);
    else this.notes.set(note.id, note);
    await putNote({
      id: note.id,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      dirty: false,
      remoteMtime,
      blob,
    });
  }

  async markPushed(id: string, remoteMtime: number): Promise<void> {
    const meta = this.meta.get(id);
    const blob = this.blobs.get(id);
    if (!meta || !blob) return;
    meta.dirty = false;
    meta.remoteMtime = remoteMtime;
    await putNote({
      id,
      updatedAt: meta.updatedAt,
      deletedAt: meta.deletedAt,
      dirty: false,
      remoteMtime,
      blob,
    });
  }

  /** Record the remote file time without clearing the dirty flag. */
  async setRemoteMtime(id: string, remoteMtime: number): Promise<void> {
    const meta = this.meta.get(id);
    const blob = this.blobs.get(id);
    if (!meta || !blob) return;
    meta.remoteMtime = remoteMtime;
    await putNote({
      id,
      updatedAt: meta.updatedAt,
      deletedAt: meta.deletedAt,
      dirty: meta.dirty,
      remoteMtime,
      blob,
    });
  }

  /** Re-encrypt everything with a new key/header (used when joining a folder vault). */
  async rekey(header: VaultHeader, key: CryptoKey): Promise<void> {
    const notes = this.list();
    await clearAll();
    this.header = header;
    this.key = key;
    this.notes = new Map();
    this.meta = new Map();
    this.blobs = new Map();
    await setVaultValue(KEY_HEADER, header);
    for (const note of notes) {
      this.notes.set(note.id, note);
      await this.persist(note);
    }
  }

  /** Replace the local vault entirely with an imported header, key and notes. */
  static async replaceWith(header: VaultHeader, key: CryptoKey, notes: Note[]): Promise<Vault> {
    await clearAll();
    await setVaultValue(KEY_HEADER, header);
    const vault = new Vault(header, key);
    for (const note of notes) {
      vault.notes.set(note.id, note);
      await vault.persist(note);
    }
    return vault;
  }

  async makeTrustedKey(days: number): Promise<TrustedKey> {
    const raw = await exportKeyRaw(this.key);
    return { key: toBase64(raw), salt: this.header.salt, until: Date.now() + days * 86400000 };
  }
}

export function saveTrustedKey(trusted: TrustedKey): void {
  localStorage.setItem(TRUST_PREFIX + trusted.salt, JSON.stringify(trusted));
}

export function loadTrustedKey(salt: string): TrustedKey | null {
  const raw = localStorage.getItem(TRUST_PREFIX + salt);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TrustedKey;
    if (parsed.until < Date.now()) {
      localStorage.removeItem(TRUST_PREFIX + salt);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearTrustedKey(salt: string): void {
  localStorage.removeItem(TRUST_PREFIX + salt);
}
