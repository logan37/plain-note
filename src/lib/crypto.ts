const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const KDF_ITERATIONS = 310_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function importKeyRaw(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

export async function decryptBytes(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
  if (payload.length <= IV_BYTES) throw new Error('Ciphertext is too short');
  const iv = payload.subarray(0, IV_BYTES);
  const ciphertext = payload.subarray(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plaintext);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, payload: Uint8Array): Promise<T> {
  return JSON.parse(decoder.decode(await decryptBytes(key, payload))) as T;
}
