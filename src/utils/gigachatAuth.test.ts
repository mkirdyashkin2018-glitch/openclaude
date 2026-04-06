import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearGigaChatCredentialCache,
  getGigaChatFetchOptions,
  resolveGigaChatCredential,
} from './gigachatAuth.ts'
import type { TLSConfig } from './mtls.ts'

const originalEnv = {
  GIGACHAT_CERT_PATH: process.env.GIGACHAT_CERT_PATH,
  GIGACHAT_KEY_PATH: process.env.GIGACHAT_KEY_PATH,
  GIGACHAT_CA_PATH: process.env.GIGACHAT_CA_PATH,
  GIGACHAT_KEY_PASSPHRASE: process.env.GIGACHAT_KEY_PASSPHRASE,
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

afterEach(() => {
  restoreEnv('GIGACHAT_CERT_PATH', originalEnv.GIGACHAT_CERT_PATH)
  restoreEnv('GIGACHAT_KEY_PATH', originalEnv.GIGACHAT_KEY_PATH)
  restoreEnv('GIGACHAT_CA_PATH', originalEnv.GIGACHAT_CA_PATH)
  restoreEnv('GIGACHAT_KEY_PASSPHRASE', originalEnv.GIGACHAT_KEY_PASSPHRASE)
  clearGigaChatCredentialCache()
})

test('returns missing_paths when cert/key env vars are absent', () => {
  delete process.env.GIGACHAT_CERT_PATH
  delete process.env.GIGACHAT_KEY_PATH

  const resolved = resolveGigaChatCredential(process.env)

  expect(resolved).toMatchObject({
    kind: 'none',
    reason: 'missing_paths',
  })
})

test('returns read_failed when certificate files are unreadable', () => {
  process.env.GIGACHAT_CERT_PATH = '/does/not/exist/client.crt'
  process.env.GIGACHAT_KEY_PATH = '/does/not/exist/client.key'

  const resolved = resolveGigaChatCredential(process.env)

  expect(resolved.kind).toBe('none')
  if (resolved.kind === 'none') {
    expect(resolved.reason).toBe('read_failed')
  }
})

test('loads cert/key/ca files for strict mTLS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'openclaude-gigachat-auth-'))
  try {
    const certPath = join(dir, 'client.crt')
    const keyPath = join(dir, 'client.key')
    const caPath = join(dir, 'ca.crt')
    writeFileSync(
      certPath,
      '-----BEGIN CERTIFICATE-----\nTEST_CERT\n-----END CERTIFICATE-----\n',
    )
    writeFileSync(
      keyPath,
      '-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----\n',
    )
    writeFileSync(
      caPath,
      '-----BEGIN CERTIFICATE-----\nTEST_CA\n-----END CERTIFICATE-----\n',
    )

    process.env.GIGACHAT_CERT_PATH = certPath
    process.env.GIGACHAT_KEY_PATH = keyPath
    process.env.GIGACHAT_CA_PATH = caPath
    process.env.GIGACHAT_KEY_PASSPHRASE = 'secret'

    const resolved = resolveGigaChatCredential(process.env)
    expect(resolved.kind).toBe('certificate')
    if (resolved.kind === 'certificate') {
      expect(resolved.certPath).toBe(certPath)
      expect(resolved.keyPath).toBe(keyPath)
      expect(resolved.caPath).toBe(caPath)
      expect(resolved.passphrase).toBe('secret')
      expect(resolved.cert).toContain('TEST_CERT')
      expect(resolved.key).toContain('TEST_KEY')
      expect(resolved.ca).toBeDefined()
    }

    const fetchOptions = getGigaChatFetchOptions(process.env)
    expect(
      fetchOptions.tls !== undefined || fetchOptions.dispatcher !== undefined,
    ).toBe(true)
    if (fetchOptions.tls) {
      expect(
        (fetchOptions.tls as TLSConfig & { rejectUnauthorized?: boolean })
          .rejectUnauthorized,
      ).toBe(false)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
