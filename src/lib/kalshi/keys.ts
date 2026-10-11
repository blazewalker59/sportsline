/**
 * A Viewer's Kalshi API private key (docs/adr/0003): imported for signing
 * with WebCrypto, never stored in the clear. Kalshi issues RSA keys as
 * PKCS#1 PEM ("BEGIN RSA PRIVATE KEY"), which WebCrypto can't import
 * directly, so they are rewrapped as PKCS#8; Ed25519 keys come as PKCS#8.
 */

type KeyType = 'rsa' | 'ed25519'

export interface SigningKey {
  type: KeyType
  key: CryptoKey
}

function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** DER length octets. */
function derLength(n: number): Array<number> {
  if (n < 0x80) return [n]
  const bytes: Array<number> = []
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff)
  return [0x80 | bytes.length, ...bytes]
}

function der(tag: number, body: ArrayLike<number>): Array<number> {
  return [tag, ...derLength(body.length), ...Array.from(body)]
}

/** PKCS#1 RSAPrivateKey → PKCS#8 PrivateKeyInfo. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = [0x02, 0x01, 0x00]
  // AlgorithmIdentifier { rsaEncryption, NULL }
  const algorithm = der(0x30, [
    ...der(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
    0x05,
    0x00,
  ])
  return new Uint8Array(
    der(0x30, [...version, ...algorithm, ...der(0x04, pkcs1)]),
  )
}

/** Import a PEM private key for signing; throws if it isn't one we can use. */
export async function importSigningKey(pem: string): Promise<SigningKey> {
  const trimmed = pem.trim()
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) {
    throw new Error('Not a PEM private key')
  }
  const body = pemBody(trimmed)
  if (trimmed.includes('BEGIN RSA PRIVATE KEY')) {
    return {
      type: 'rsa',
      key: await crypto.subtle.importKey(
        'pkcs8',
        pkcs1ToPkcs8(body),
        { name: 'RSA-PSS', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
    }
  }
  try {
    return {
      type: 'rsa',
      key: await crypto.subtle.importKey(
        'pkcs8',
        body,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
    }
  } catch {
    return {
      type: 'ed25519',
      key: await crypto.subtle.importKey(
        'pkcs8',
        body,
        { name: 'Ed25519' },
        false,
        ['sign'],
      ),
    }
  }
}

function base64(bytes: ArrayBuffer): string {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Kalshi's request signature: RSA-PSS (SHA-256, 32-byte salt) or Ed25519, base64. */
export async function signMessage(
  signer: SigningKey,
  message: string,
): Promise<string> {
  const data = new TextEncoder().encode(message)
  const signature =
    signer.type === 'rsa'
      ? await crypto.subtle.sign(
          { name: 'RSA-PSS', saltLength: 32 },
          signer.key,
          data,
        )
      : await crypto.subtle.sign({ name: 'Ed25519' }, signer.key, data)
  return base64(signature)
}
