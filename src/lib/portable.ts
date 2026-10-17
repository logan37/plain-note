import { decryptJson, encryptJson, fromBase64, toBase64 } from './crypto';
import { noteParts } from './text';
import type { Note, VaultHeader } from './types';
import { Vault } from './vault';

export interface VaultArchive {
  format: 1;
  app: 'plain-note';
  exportedAt: number;
  header: VaultHeader;
  payload: string;
}

export async function buildArchive(vault: Vault): Promise<VaultArchive> {
  const payload = await encryptJson(vault.key, { notes: vault.list() });
  return {
    format: 1,
    app: 'plain-note',
    exportedAt: Date.now(),
    header: vault.header,
    payload: toBase64(payload),
  };
}

export function isArchive(value: unknown): value is VaultArchive {
  if (!value || typeof value !== 'object') return false;
  const archive = value as Partial<VaultArchive>;
  return (
    archive.app === 'plain-note' &&
    archive.format === 1 &&
    typeof archive.payload === 'string' &&
    Boolean(archive.header && typeof archive.header.salt === 'string')
  );
}

export async function openArchive(
  archive: VaultArchive,
  passphrase: string,
): Promise<{ header: VaultHeader; key: CryptoKey; notes: Note[] }> {
  const vault = await Vault.adoptHeader(archive.header, passphrase);
  const payload = await decryptJson<{ notes: Note[] }>(vault.key, fromBase64(archive.payload));
  return { header: archive.header, key: vault.key, notes: payload.notes };
}

export function toMarkdown(notes: Note[]): string {
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  const blocks = sorted.map((note) => {
    const { title, body } = noteParts(note.content);
    const tags = note.tags.length > 0 ? `\n\nTags: ${note.tags.map((t) => `#${t}`).join(' ')}` : '';
    const meta = `\n\n_Updated ${new Date(note.updatedAt).toLocaleString()}_${tags}`;
    return `# ${title}${meta}\n\n${body}`.trim();
  });
  return `${blocks.join('\n\n---\n\n')}\n`;
}

export function download(filename: string, data: string | Blob, type = 'application/json'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestamped(prefix: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}-${stamp}.${extension}`;
}
