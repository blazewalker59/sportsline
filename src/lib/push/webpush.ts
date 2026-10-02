/**
 * Web Push on WebCrypto, so it runs in a Worker with no dependencies:
 * payload encryption (RFC 8291, aes128gcm) and VAPID authorization
 * (RFC 8292, ES256 JWT). Works with Apple's, Google's and Mozilla's push
 * services alike.
 */

export interface PushSubscriptionRecord {
  endpoint: string
  /** Browser's P-256 public key, base64url (uncompressed point). */
  p256dh: string
  /** Browser's 16-byte auth secret, base64url. */
  auth: string
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (also given to the browser). */
  publicKey: string
  /** The matching private key as a JWK (JSON string). */
  privateJwk: string
  /** Contact for push services: a mailto: or https: URL. */
  subject: string
}

/** Bytes backed by a plain ArrayBuffer (what WebCrypto accepts). */
type Bytes = Uint8Array<ArrayBuffer>

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Bytes {
  const b64 = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Array<Uint8Array>): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  bytes: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

/** The content-encryption key and nonce shared by sender and browser (RFC 8291 §3.4). */
export async function deriveKeys(
  sharedSecret: Bytes,
  authSecret: Bytes,
  uaPublic: Bytes,
  asPublic: Bytes,
  salt: Bytes,
): Promise<{ cek: Bytes; nonce: Bytes }> {
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32)
  const cek = await hkdf(
    salt,
    ikm,
    enc.encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = await hkdf(
    salt,
    ikm,
    enc.encode('Content-Encoding: nonce\0'),
    12,
  )
  return { cek, nonce }
}

/** Encrypt a payload for one subscription: the aes128gcm request body. */
export async function encryptPayload(
  sub: PushSubscriptionRecord,
  payload: string,
): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const local = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer,
  )
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey },
      local.privateKey,
      256,
    ),
  )
  const { cek, nonce } = await deriveKeys(
    shared,
    authSecret,
    uaPublic,
    asPublic,
    salt,
  )
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'encrypt',
  ])
  // One record: the payload, then the 0x02 "last record" delimiter.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext),
  )
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

/** `Authorization: vapid t=…, k=…` for one push service (RFC 8292). */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now = Date.now(),
): Promise<string> {
  const audience = new URL(endpoint).origin
  const header = b64urlEncode(
    enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  )
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  )
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(keys.privateJwk) as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // WebCrypto's ECDSA signature is raw r‖s, exactly what ES256 JWTs use.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      enc.encode(unsigned),
    ),
  )
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${keys.publicKey}`
}

export type PushResult = 'sent' | 'gone' | 'failed'

/**
 * Send one Web Push message. `gone` means the subscription is dead (the
 * browser unsubscribed or the app was removed) and should be deleted.
 */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: string,
  keys: VapidKeys,
  options: { ttlSeconds?: number; topic?: string } = {},
): Promise<PushResult> {
  const body = await encryptPayload(sub, payload)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSeconds ?? 600),
      Urgency: 'high',
      // A newer message with the same topic replaces an undelivered older one.
      ...(options.topic ? { Topic: options.topic } : {}),
    },
    body,
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  return res.ok ? 'sent' : 'failed'
}
