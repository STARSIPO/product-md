import { describe, expect, it } from 'vitest'
import { buildOtpAuthUri, generateTotp, generateTotpSecret, verifyTotp } from '@/server/auth/totp'

describe('TOTP', () => {
  it('generates a base32 secret of the RFC-recommended length', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    // 160 bits base32-encoded
    expect(secret.length).toBeGreaterThanOrEqual(32)
    expect(generateTotpSecret()).not.toBe(secret)
  })

  it('accepts the code it just produced', () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(secret, generateTotp(secret))).toBe(true)
  })

  it('tolerates one step of clock drift and no more', () => {
    const secret = generateTotpSecret()
    const step = 30_000

    const previous = generateTotp(secret, new Date(Date.now() - step))
    const next = generateTotp(secret, new Date(Date.now() + step))
    const tooOld = generateTotp(secret, new Date(Date.now() - step * 5))

    expect(verifyTotp(secret, previous)).toBe(true)
    expect(verifyTotp(secret, next)).toBe(true)
    expect(verifyTotp(secret, tooOld)).toBe(false)
  })

  it('rejects malformed and wrong codes', () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(secret, '000000')).toBe(false)
    expect(verifyTotp(secret, '12345')).toBe(false)
    expect(verifyTotp(secret, 'abcdef')).toBe(false)
    expect(verifyTotp(secret, '')).toBe(false)
    expect(verifyTotp('', '123456')).toBe(false)
  })

  it("does not accept another secret's code", () => {
    const a = generateTotpSecret()
    const b = generateTotpSecret()
    expect(verifyTotp(b, generateTotp(a))).toBe(false)
  })

  it('builds an otpauth URI authenticator apps can import', () => {
    const secret = generateTotpSecret()
    const uri = buildOtpAuthUri(secret, 'admin@product.md')

    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(`secret=${secret}`)
    expect(uri).toContain('issuer=Product.md')
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })
})
