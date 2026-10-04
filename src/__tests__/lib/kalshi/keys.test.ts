import { constants, generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { importSigningKey, signMessage } from '@/lib/kalshi/keys'
import { seal, unseal } from '@/lib/kalshi/vault'

const MESSAGE = '1727000000000GET/trade-api/v2/portfolio/positions'

describe('Kalshi request signing', () => {
  it('signs with an RSA key in PKCS#1 PEM, as Kalshi issues them (RSA-PSS, SHA-256, 32-byte salt)', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    expect(privateKey).toContain('BEGIN RSA PRIVATE KEY')
    const signer = await importSigningKey(privateKey)
    expect(signer.type).toBe('rsa')
    const signature = await signMessage(signer, MESSAGE)
    expect(
      verify(
        'sha256',
        Buffer.from(MESSAGE),
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
        Buffer.from(signature, 'base64'),
      ),
    ).toBe(true)
  })

  it('signs with an Ed25519 key in PKCS#8 PEM', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const signer = await importSigningKey(privateKey)
    expect(signer.type).toBe('ed25519')
    const signature = await signMessage(signer, MESSAGE)
    expect(
      verify(
        null,
        Buffer.from(MESSAGE),
        publicKey,
        Buffer.from(signature, 'base64'),
      ),
    ).toBe(true)
  })

  it('refuses anything that is not a private key', async () => {
    await expect(importSigningKey('not a key')).rejects.toThrow()
  })
})

describe('the key vault', () => {
  const secret = Buffer.alloc(32, 7).toString('base64')

  it('round-trips, with a fresh IV each time', async () => {
    const a = await seal(secret, 'private key')
    const b = await seal(secret, 'private key')
    expect(a.iv).not.toBe(b.iv)
    expect(await unseal(secret, a)).toBe('private key')
  })

  it('cannot open with another secret, and needs one at all', async () => {
    const sealed = await seal(secret, 'private key')
    await expect(
      unseal(Buffer.alloc(32, 9).toString('base64'), sealed),
    ).rejects.toThrow()
    await expect(seal(undefined, 'x')).rejects.toThrow('KALSHI_ENCRYPTION_KEY')
  })
})
