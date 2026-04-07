import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getProviderValidationError } from './providerValidation.ts'

const originalEnv = {
  CLAUDE_CODE_USE_GIGACHAT: process.env.CLAUDE_CODE_USE_GIGACHAT,
  GIGACHAT_CERT_PATH: process.env.GIGACHAT_CERT_PATH,
  GIGACHAT_KEY_PATH: process.env.GIGACHAT_KEY_PATH,
  GIGACHAT_CA_PATH: process.env.GIGACHAT_CA_PATH,
  GIGACHAT_KEY_PASSPHRASE: process.env.GIGACHAT_KEY_PASSPHRASE,
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GEMINI_ACCESS_TOKEN: process.env.GEMINI_ACCESS_TOKEN,
  GEMINI_AUTH_MODE: process.env.GEMINI_AUTH_MODE,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

afterEach(() => {
  restoreEnv('CLAUDE_CODE_USE_GIGACHAT', originalEnv.CLAUDE_CODE_USE_GIGACHAT)
  restoreEnv('GIGACHAT_CERT_PATH', originalEnv.GIGACHAT_CERT_PATH)
  restoreEnv('GIGACHAT_KEY_PATH', originalEnv.GIGACHAT_KEY_PATH)
  restoreEnv('GIGACHAT_CA_PATH', originalEnv.GIGACHAT_CA_PATH)
  restoreEnv(
    'GIGACHAT_KEY_PASSPHRASE',
    originalEnv.GIGACHAT_KEY_PASSPHRASE,
  )
  restoreEnv('CLAUDE_CODE_USE_GEMINI', originalEnv.CLAUDE_CODE_USE_GEMINI)
  restoreEnv('GEMINI_API_KEY', originalEnv.GEMINI_API_KEY)
  restoreEnv('GOOGLE_API_KEY', originalEnv.GOOGLE_API_KEY)
  restoreEnv('GEMINI_ACCESS_TOKEN', originalEnv.GEMINI_ACCESS_TOKEN)
  restoreEnv('GEMINI_AUTH_MODE', originalEnv.GEMINI_AUTH_MODE)
  restoreEnv(
    'GOOGLE_APPLICATION_CREDENTIALS',
    originalEnv.GOOGLE_APPLICATION_CREDENTIALS,
  )
})

test('accepts GigaChat strict mTLS cert/key credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'openclaude-gigachat-'))
  try {
    const certPath = join(dir, 'client.crt')
    const keyPath = join(dir, 'client.key')
    writeFileSync(certPath, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n')
    writeFileSync(keyPath, '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n')

    process.env.CLAUDE_CODE_USE_GIGACHAT = '1'
    process.env.GIGACHAT_CERT_PATH = certPath
    process.env.GIGACHAT_KEY_PATH = keyPath

    await expect(getProviderValidationError(process.env)).resolves.toBeNull()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('errors when GigaChat cert/key are missing', async () => {
  process.env.CLAUDE_CODE_USE_GIGACHAT = '1'
  delete process.env.GIGACHAT_CERT_PATH
  delete process.env.GIGACHAT_KEY_PATH

  await expect(getProviderValidationError(process.env)).resolves.toBe(
    'GIGACHAT_CERT_PATH, GIGACHAT_KEY_PATH are required when CLAUDE_CODE_USE_GIGACHAT=1.',
  )
})

test('accepts GEMINI_ACCESS_TOKEN as valid Gemini auth', async () => {
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_AUTH_MODE = 'access-token'
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  process.env.GEMINI_ACCESS_TOKEN = 'token-123'

  await expect(getProviderValidationError(process.env)).resolves.toBeNull()
})

test('accepts ADC credentials for Gemini auth', async () => {
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_AUTH_MODE = 'adc'
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  delete process.env.GEMINI_ACCESS_TOKEN

  await expect(
    getProviderValidationError(process.env, {
      resolveGeminiCredential: async () => ({
        kind: 'adc',
        credential: 'adc-token',
        projectId: 'adc-project',
      }),
    }),
  ).resolves.toBeNull()
})

test('still errors when no Gemini credential source is available', async () => {
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_AUTH_MODE = 'access-token'
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  delete process.env.GEMINI_ACCESS_TOKEN
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS

  await expect(getProviderValidationError(process.env)).resolves.toBe(
    'GEMINI_API_KEY, GOOGLE_API_KEY, GEMINI_ACCESS_TOKEN, or Google ADC credentials are required when CLAUDE_CODE_USE_GEMINI=1.',
  )
})
