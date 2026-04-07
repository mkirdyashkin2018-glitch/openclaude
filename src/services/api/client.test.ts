import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAnthropicClient } from './client.js'

type FetchType = typeof globalThis.fetch

type ShimClient = {
  beta: {
    messages: {
      create: (params: Record<string, unknown>) => Promise<unknown>
    }
  }
}

const originalFetch = globalThis.fetch
const originalMacro = (globalThis as Record<string, unknown>).MACRO
const originalEnv = {
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  CLAUDE_CODE_USE_GIGACHAT: process.env.CLAUDE_CODE_USE_GIGACHAT,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
  GIGACHAT_BASE_URL: process.env.GIGACHAT_BASE_URL,
  GIGACHAT_MODEL: process.env.GIGACHAT_MODEL,
  GIGACHAT_CERT_PATH: process.env.GIGACHAT_CERT_PATH,
  GIGACHAT_KEY_PATH: process.env.GIGACHAT_KEY_PATH,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
}

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).MACRO = { VERSION: 'test-version' }
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_API_KEY = 'gemini-test-key'
  process.env.GEMINI_MODEL = 'gemini-2.0-flash'
  process.env.GEMINI_BASE_URL = 'https://gemini.example/v1beta/openai'

  delete process.env.GOOGLE_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_BASE_URL
  delete process.env.OPENAI_MODEL
  delete process.env.CLAUDE_CODE_USE_GIGACHAT
  delete process.env.GIGACHAT_BASE_URL
  delete process.env.GIGACHAT_MODEL
  delete process.env.GIGACHAT_CERT_PATH
  delete process.env.GIGACHAT_KEY_PATH
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
})

afterEach(() => {
  ;(globalThis as Record<string, unknown>).MACRO = originalMacro
  process.env.CLAUDE_CODE_USE_GEMINI = originalEnv.CLAUDE_CODE_USE_GEMINI
  process.env.CLAUDE_CODE_USE_GIGACHAT = originalEnv.CLAUDE_CODE_USE_GIGACHAT
  process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY
  process.env.GEMINI_MODEL = originalEnv.GEMINI_MODEL
  process.env.GEMINI_BASE_URL = originalEnv.GEMINI_BASE_URL
  process.env.GIGACHAT_BASE_URL = originalEnv.GIGACHAT_BASE_URL
  process.env.GIGACHAT_MODEL = originalEnv.GIGACHAT_MODEL
  process.env.GIGACHAT_CERT_PATH = originalEnv.GIGACHAT_CERT_PATH
  process.env.GIGACHAT_KEY_PATH = originalEnv.GIGACHAT_KEY_PATH
  process.env.GOOGLE_API_KEY = originalEnv.GOOGLE_API_KEY
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
  process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_AUTH_TOKEN = originalEnv.ANTHROPIC_AUTH_TOKEN
  globalThis.fetch = originalFetch
})

test('routes Gemini provider requests through the OpenAI-compatible shim', async () => {
  let capturedUrl: string | undefined
  let capturedHeaders: Headers | undefined
  let capturedBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (input, init) => {
    capturedUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    capturedHeaders = new Headers(init?.headers)
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>

    return new Response(
      JSON.stringify({
        id: 'chatcmpl-gemini',
        model: 'gemini-2.0-flash',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'gemini ok',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 3,
          total_tokens: 11,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }) as FetchType

  const client = (await getAnthropicClient({
    maxRetries: 0,
    model: 'gemini-2.0-flash',
  })) as unknown as ShimClient

  const response = await client.beta.messages.create({
    model: 'gemini-2.0-flash',
    system: 'test system',
    messages: [{ role: 'user', content: 'hello' }],
    max_tokens: 64,
    stream: false,
  })

  expect(capturedUrl).toBe('https://gemini.example/v1beta/openai/chat/completions')
  expect(capturedHeaders?.get('authorization')).toBe('Bearer gemini-test-key')
  expect(capturedBody?.model).toBe('gemini-2.0-flash')
  expect(response).toMatchObject({
    role: 'assistant',
    model: 'gemini-2.0-flash',
  })
})

test('routes GigaChat strict mTLS requests through the OpenAI-compatible shim', async () => {
  const certDir = mkdtempSync(join(tmpdir(), 'openclaude-gigachat-client-'))
  try {
    const certPath = join(certDir, 'client.crt')
    const keyPath = join(certDir, 'client.key')
    writeFileSync(
      certPath,
      '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n',
    )
    writeFileSync(
      keyPath,
      '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
    )

    delete process.env.CLAUDE_CODE_USE_GEMINI
    process.env.CLAUDE_CODE_USE_GIGACHAT = '1'
    process.env.GIGACHAT_BASE_URL = 'https://gigachat.devices.sberbank.ru/api/v1'
    process.env.GIGACHAT_MODEL = 'GigaChat-2'
    process.env.GIGACHAT_CERT_PATH = certPath
    process.env.GIGACHAT_KEY_PATH = keyPath
    process.env.OPENAI_API_KEY = 'sk-should-not-be-used'
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_MODEL

    let capturedUrl: string | undefined
    let capturedHeaders: Headers | undefined
    globalThis.fetch = (async (input, init) => {
      capturedUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      capturedHeaders = new Headers(init?.headers)

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-gigachat',
          model: 'GigaChat-2',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'gigachat ok',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 2,
            total_tokens: 4,
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }) as FetchType

    const client = (await getAnthropicClient({
      maxRetries: 0,
      model: 'GigaChat-2',
    })) as unknown as ShimClient

    const response = await client.beta.messages.create({
      model: 'GigaChat-2',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 64,
      stream: false,
    })

    expect(capturedUrl).toBe(
      'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    )
    expect(capturedHeaders?.get('authorization')).toBeNull()
    expect(response).toMatchObject({
      role: 'assistant',
      model: 'GigaChat-2',
    })
  } finally {
    rmSync(certDir, { recursive: true, force: true })
  }
})
