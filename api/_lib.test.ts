import { beforeAll, describe, expect, it } from 'vitest'
import { decryptToken, encryptToken, isAllowedOrigin, signState, verifyState } from './_lib.js'

beforeAll(() => {
  process.env.TOKEN_SECRET = 'test-secret-with-at-least-32-chars!!'
  process.env.APP_ORIGINS = 'https://onix.web.app'
})

describe('api helpers', () => {
  it('round-trips an encrypted refresh token without exposing it', async () => {
    const jwe = await encryptToken({ uid: 'u1', refresh_token: '1//secret' })
    expect(jwe).not.toContain('secret')
    expect(await decryptToken(jwe)).toEqual({ uid: 'u1', refresh_token: '1//secret' })
  })

  it('rejects tampered state', async () => {
    const state = await signState({ uid: 'u1', returnTo: 'https://onix.web.app' })
    expect((await verifyState(state)).uid).toBe('u1')
    await expect(verifyState(state.slice(0, -2) + 'xx')).rejects.toThrow()
  })

  it('only allows configured origins and localhost', () => {
    expect(isAllowedOrigin('https://onix.web.app')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('https://evil.example')).toBe(false)
  })
})
