import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { decryptJson, deriveKey, fromBase64 } from '../src/lib/crypto';
import { clearAll, getAllNotes } from '../src/lib/db';
import { Vault } from '../src/lib/vault';
import { FolderVaultMismatchError, syncVault } from '../src/lib/sync/engine';
import { HEADER_FILE, NOTES_DIR, type SyncBackend } from '../src/lib/sync/platform';

class MemoryBackend implements SyncBackend {
  readonly kind = 'folder-browser' as const;
  readonly label = 'memory';
  private files = new Map<string, { data: Uint8Array; mtime: number }>();
  private clock = 0;

  async ensure(): Promise<void> {}
  async ensurePermission(): Promise<void> {}

  async listFiles(dir: string): Promise<string[]> {
    return [...this.files.keys()]
      .filter((path) => path.startsWith(`${dir}/`))
      .map((path) => path.slice(dir.length + 1));
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    return this.files.get(path)?.data ?? null;
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.clock += 1;
    this.files.set(path, { data, mtime: 1_000_000 + this.clock });
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async mtime(path: string): Promise<number> {
    return this.files.get(path)?.mtime ?? 0;
  }

  raw(path: string): Uint8Array | undefined {
    return this.files.get(path)?.data;
  }

  noteFiles(): string[] {
    return [...this.files.keys()].filter((path) => path.startsWith(`${NOTES_DIR}/`));
  }

  header(): Uint8Array | undefined {
    return this.files.get(HEADER_FILE)?.data;
  }
}

const PASSPHRASE = 'a very secret passphrase';

async function device(header: Vault['header'], passphrase = PASSPHRASE): Promise<Vault> {
  await clearAll();
  const key = await deriveKey(passphrase, fromBase64(header.salt), header.iterations);
  return Vault.replaceWith(header, key, []);
}

async function main() {
  const folder = new MemoryBackend();

  // Device A creates a vault and two notes.
  await clearAll();
  const a = await Vault.create(PASSPHRASE);
  const first = await a.createNote('Shopping\nmilk and bread');
  const second = await a.createNote('Ideas\nbuild a notes app');
  await a.updateNote(first.id, { tags: ['home'], pinned: true });
  await a.updateNote(second.id, { tags: ['home', 'work'], favourite: true });

  const pushResult = await syncVault(a, folder);
  assert.equal(pushResult.pushed, 2, 'device A pushes two notes');
  assert.ok(folder.header(), 'header file is written');
  assert.equal(folder.noteFiles().length, 2, 'two encrypted note files exist');

  // Encryption at rest: neither the local blobs nor the folder files may leak plaintext.
  const records = await getAllNotes();
  const localRaw = Buffer.concat(records.map((record) => Buffer.from(record.blob))).toString('latin1');
  assert.ok(!localRaw.includes('Shopping'), 'local blobs are ciphertext');
  const folderRaw = folder
    .noteFiles()
    .map((path) => Buffer.from(folder.raw(path)!))
    .reduce((acc, buf) => Buffer.concat([acc, buf]), Buffer.alloc(0))
    .toString('latin1');
  assert.ok(!folderRaw.includes('Ideas'), 'folder files are ciphertext');

  const plainHeader = Buffer.from(folder.header()!).toString('utf8');
  assert.ok(
    plainHeader.includes('PBKDF2') && !plainHeader.includes('secret'),
    'header holds only KDF parameters',
  );

  // Device B joins the same vault and pulls.
  const b = await device(a.header);
  const pullB = await syncVault(b, folder);
  assert.equal(pullB.pulled, 2, 'device B pulls two notes');
  assert.equal(b.count(), 2, 'device B has both notes');
  const bSecond = b.list().find((note) => note.content.startsWith('Ideas'))!;
  assert.deepEqual(bSecond.tags.slice().sort(), ['home', 'work'], 'tags survive the roundtrip');
  assert.equal(bSecond.favourite, true, 'favourite flag survives');
  const bFirst = b.list().find((note) => note.content.startsWith('Shopping'))!;
  assert.equal(bFirst.pinned, true, 'pin survives');

  // Edits converge (last write wins).
  await new Promise((resolve) => setTimeout(resolve, 5));
  await b.updateNote(bFirst.id, { content: 'Shopping\nmilk, bread and coffee' });
  await syncVault(b, folder);
  const pullA = await syncVault(a, folder);
  assert.equal(pullA.pulled, 1, 'device A pulls the edit');
  assert.ok(a.get(bFirst.id)!.content.includes('coffee'), 'edit propagated to device A');

  // A second sync with nothing to do stays quiet.
  const idle = await syncVault(a, folder);
  assert.deepEqual(
    { pulled: idle.pulled, pushed: idle.pushed, removed: idle.removed },
    { pulled: 0, pushed: 0, removed: 0 },
    'second sync is a no-op',
  );

  // Deletions propagate as tombstones.
  await a.deleteNote(second.id);
  const afterDelete = await syncVault(a, folder);
  assert.ok(afterDelete.pushed >= 1, 'tombstone pushed');
  const pullBDelete = await syncVault(b, folder);
  assert.ok(pullBDelete.pulled >= 1, 'device B pulls the tombstone');
  assert.equal(b.count(), 1, 'note removed on device B');
  assert.equal(folder.noteFiles().length, 2, 'tombstone file retained during the TTL window');

  // A wrong passphrase cannot read folder files.
  const wrongKey = await deriveKey('not the passphrase', fromBase64(a.header.salt), a.header.iterations);
  const sample = folder.raw(`${NOTES_DIR}/${bFirst.id}.enc`)!;
  await assert.rejects(() => decryptJson(wrongKey, sample), 'wrong passphrase cannot decrypt');

  // A different vault cannot adopt the folder.
  await clearAll();
  const other = await Vault.create('a different passphrase');
  await other.createNote('unrelated');
  await assert.rejects(() => syncVault(other, folder), FolderVaultMismatchError, 'mismatch detected');

  console.log('ok  sync (push, pull, edit, delete, encryption at rest, mismatch, wrong pass)');
}

await main();
console.log('\nSync integration tests passed.');
