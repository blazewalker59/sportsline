/**
 * Kalshi private keys at rest (docs/adr/0003): AES-GCM under
 * KALSHI_ENCRYPTION_KEY, a 32-byte key held only as a Worker secret.
 */

export interface Sealed {
  /** base64 ciphertext (with the GCM tag). */
  ciphertext: string
  /** base64 12-byte IV, fresh for every seal. */
  iv: string
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function vaultKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new Error('KALSHI_ENCRYPTION_KEY is not set')
  const raw = fromBase64(secret)
  if (raw.length !== 32) {
    throw new Error('KALSHI_ENCRYPTION_KEY must be 32 bytes, base64')
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function seal(
  secret: string | undefined,
  plaintext: string,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await vaultKey(secret),
    new TextEncoder().encode(plaintext),
  )
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) }
}

export async function unseal(
  secret: string | undefined,
  sealed: Sealed,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
    await vaultKey(secret),
    fromBase64(sealed.ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}
