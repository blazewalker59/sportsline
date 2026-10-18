/**
 * Kalshi private keys at rest (docs/adr/0003): AES-GCM under
 * KALSHI_ENCRYPTION_KEY, a 32-byte key held only as a Worker secret. ESPN
 * cookies are sealed the same way under their own (docs/adr/0004).
 *
 * Each ciphertext is bound to what it is and whose (the GCM associated
 * data), so a database write can't move a sealed value to another row or
 * Viewer: it simply won't open there. Ciphertexts carry a version prefix;
 * an unprefixed one is from before binding, and opens without it.
 */

/** What a sealed value is: each opens only as the same purpose. */
export type VaultPurpose =
  'kalshi-read' | 'kalshi-trade' | 'espn-swid' | 'espn-s2'

/** A sealed value's place: its purpose and the Viewer it belongs to. */
export interface VaultContext {
  purpose: VaultPurpose
  viewerId: string
}

const VERSION = 'v1:'

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

function additionalData(context: VaultContext): Uint8Array<ArrayBuffer> {
  // Purposes have no colon, so the first one ends it.
  return new TextEncoder().encode(`${context.purpose}:${context.viewerId}`)
}

export async function seal(
  secret: string | undefined,
  plaintext: string,
  context: VaultContext,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    await vaultKey(secret),
    new TextEncoder().encode(plaintext),
  )
  return { ciphertext: VERSION + toBase64(ciphertext), iv: toBase64(iv) }
}

/**
 * Sealed before values were bound to their place: worth sealing again, and
 * each reader does once it opens one. Legacy support can go once no such
 * rows remain, when this counts all zeros:
 *
 *   SELECT
 *     (SELECT count(*) FROM kalshi_accounts WHERE key_ciphertext NOT LIKE 'v1:%'),
 *     (SELECT count(*) FROM kalshi_trade_keys WHERE key_ciphertext NOT LIKE 'v1:%'),
 *     (SELECT count(*) FROM espn_accounts WHERE swid_ciphertext NOT LIKE 'v1:%'),
 *     (SELECT count(*) FROM espn_accounts WHERE s2_ciphertext NOT LIKE 'v1:%');
 */
export function isLegacy(sealed: Sealed): boolean {
  return !sealed.ciphertext.startsWith(VERSION)
}

export async function unseal(
  secret: string | undefined,
  sealed: Sealed,
  context: VaultContext,
): Promise<string> {
  const legacy = isLegacy(sealed)
  const plaintext = await crypto.subtle.decrypt(
    legacy
      ? { name: 'AES-GCM', iv: fromBase64(sealed.iv) }
      : {
          name: 'AES-GCM',
          iv: fromBase64(sealed.iv),
          additionalData: additionalData(context),
        },
    await vaultKey(secret),
    fromBase64(
      legacy ? sealed.ciphertext : sealed.ciphertext.slice(VERSION.length),
    ),
  )
  return new TextDecoder().decode(plaintext)
}
