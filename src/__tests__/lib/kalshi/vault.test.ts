import { describe, expect, it } from 'vitest'
import type { Sealed, VaultContext } from '@/lib/kalshi/vault'
import { isLegacy, seal, unseal } from '@/lib/kalshi/vault'

const secret = Buffer.alloc(32, 7).toString('base64')
const read: VaultContext = { purpose: 'kalshi-read', viewerId: 'u1' }

/** A value sealed the way it was before binding: no version, no AAD. */
async function legacySeal(plaintext: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(Buffer.from(secret, 'base64')),
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
  }
}

describe('the key vault', () => {
  it('round-trips, with a fresh IV each time', async () => {
    const a = await seal(secret, 'private key', read)
    const b = await seal(secret, 'private key', read)
    expect(a.iv).not.toBe(b.iv)
    expect(await unseal(secret, a, read)).toBe('private key')
  })

  it('marks what it seals with a version', async () => {
    const sealed = await seal(secret, 'private key', read)
    expect(sealed.ciphertext.startsWith('v1:')).toBe(true)
    expect(isLegacy(sealed)).toBe(false)
  })

  it('cannot open with another secret, and needs one at all', async () => {
    const sealed = await seal(secret, 'private key', read)
    await expect(
      unseal(Buffer.alloc(32, 9).toString('base64'), sealed, read),
    ).rejects.toThrow()
    await expect(seal(undefined, 'x', read)).rejects.toThrow(
      'KALSHI_ENCRYPTION_KEY',
    )
  })

  it('refuses a value moved to another Viewer', async () => {
    const sealed = await seal(secret, 'private key', read)
    await expect(
      unseal(secret, sealed, { purpose: 'kalshi-read', viewerId: 'u2' }),
    ).rejects.toThrow()
  })

  it('refuses a value moved to another purpose', async () => {
    const trade = await seal(secret, 'trade key', {
      purpose: 'kalshi-trade',
      viewerId: 'u1',
    })
    await expect(unseal(secret, trade, read)).rejects.toThrow()
    const swid = await seal(secret, '{swid}', {
      purpose: 'espn-swid',
      viewerId: 'u1',
    })
    await expect(
      unseal(secret, swid, { purpose: 'espn-s2', viewerId: 'u1' }),
    ).rejects.toThrow()
  })

  it('refuses a versioned value with its version stripped', async () => {
    const sealed = await seal(secret, 'private key', read)
    const stripped = { ...sealed, ciphertext: sealed.ciphertext.slice(3) }
    await expect(unseal(secret, stripped, read)).rejects.toThrow()
  })

  it('still opens a value sealed before binding, as legacy', async () => {
    const old = await legacySeal('old key')
    expect(isLegacy(old)).toBe(true)
    expect(await unseal(secret, old, read)).toBe('old key')
  })
})
