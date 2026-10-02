import { describe, expect, it } from 'vitest'
import {
  b64urlDecode,
  b64urlEncode,
  deriveKeys,
  encryptPayload,
  vapidAuthorization,
} from '@/lib/push/webpush'

/** A browser's side of a subscription. */
async function browser() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const publicRaw = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  )
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    pair,
    publicRaw,
    auth,
    sub: {
      endpoint: 'https://web.push.apple.com/abc',
      p256dh: b64urlEncode(publicRaw),
      auth: b64urlEncode(auth),
    },
  }
}

/** Decrypt the way a browser does (RFC 8291), to prove the body is readable. */
async function decrypt(
  body: Uint8Array<ArrayBuffer>,
  b: Awaited<ReturnType<typeof browser>>,
): Promise<string> {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  const asKey = await crypto.subtle.importKey(
    'raw',
    asPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asKey },
      b.pair.privateKey,
      256,
    ),
  )
  const { cek, nonce } = await deriveKeys(
    shared,
    b.auth,
    b.publicRaw,
    asPublic,
    salt,
  )
  const key = await crypto.subtle.importKey(
    'raw',
    cek as BufferSource,
    'AES-GCM',
    false,
    ['decrypt'],
  )
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      key,
      ciphertext as BufferSource,
    ),
  )
  expect(plain.at(-1)).toBe(2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('Web Push encryption', () => {
  it('produces an aes128gcm body the browser can decrypt', async () => {
    const b = await browser()
    const payload = JSON.stringify({
      title: 'Touchdown',
      body: 'PIT 24 – 24 CLE',
    })
    const body = await encryptPayload(b.sub, payload)
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(body[20]).toBe(65)
    expect(await decrypt(body, b)).toBe(payload)
  })
})

describe('VAPID', () => {
  it('signs a JWT for the push service’s origin that verifies with the public key', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const publicKey = b64urlEncode(
      new Uint8Array(
        (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
      ),
    )
    const privateJwk = JSON.stringify(
      await crypto.subtle.exportKey('jwk', pair.privateKey),
    )
    const header = await vapidAuthorization(
      'https://web.push.apple.com/QH/abc',
      { publicKey, privateJwk, subject: 'https://sportsline.dev' },
      Date.parse('2026-10-02T20:00:00Z'),
    )
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(k).toBe(publicKey)
    const [h, c, s] = token.split('.')
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)))
    expect(claims).toMatchObject({
      aud: 'https://web.push.apple.com',
      sub: 'https://sportsline.dev',
    })
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      b64urlDecode(s) as BufferSource,
      new TextEncoder().encode(`${h}.${c}`),
    )
    expect(ok).toBe(true)
  })
})
