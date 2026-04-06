import { afterEach, expect, test } from 'bun:test'

const originalEnv = {
  CLAUDE_CODE_USE_GIGACHAT: process.env.CLAUDE_CODE_USE_GIGACHAT,
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  CLAUDE_CODE_USE_GITHUB: process.env.CLAUDE_CODE_USE_GITHUB,
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
  CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,
  CLAUDE_CODE_USE_FOUNDRY: process.env.CLAUDE_CODE_USE_FOUNDRY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  GIGACHAT_MODEL: process.env.GIGACHAT_MODEL,
} as const

afterEach(() => {
  process.env.CLAUDE_CODE_USE_GIGACHAT = originalEnv.CLAUDE_CODE_USE_GIGACHAT
  process.env.CLAUDE_CODE_USE_GEMINI = originalEnv.CLAUDE_CODE_USE_GEMINI
  process.env.CLAUDE_CODE_USE_GITHUB = originalEnv.CLAUDE_CODE_USE_GITHUB
  process.env.CLAUDE_CODE_USE_OPENAI = originalEnv.CLAUDE_CODE_USE_OPENAI
  process.env.CLAUDE_CODE_USE_BEDROCK = originalEnv.CLAUDE_CODE_USE_BEDROCK
  process.env.CLAUDE_CODE_USE_VERTEX = originalEnv.CLAUDE_CODE_USE_VERTEX
  process.env.CLAUDE_CODE_USE_FOUNDRY = originalEnv.CLAUDE_CODE_USE_FOUNDRY
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
  process.env.GIGACHAT_MODEL = originalEnv.GIGACHAT_MODEL
})

function clearProviderEnv(): void {
  delete process.env.CLAUDE_CODE_USE_GIGACHAT
  delete process.env.CLAUDE_CODE_USE_GEMINI
  delete process.env.CLAUDE_CODE_USE_GITHUB
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
  delete process.env.OPENAI_MODEL
  delete process.env.GIGACHAT_MODEL
}

async function importFreshModelModule() {
  return import(`./model.js?ts=${Date.now()}-${Math.random()}`)
}

test('gigachat provider uses GIGACHAT_MODEL for user-specified and default model selection', async () => {
  clearProviderEnv()
  process.env.CLAUDE_CODE_USE_GIGACHAT = '1'
  process.env.GIGACHAT_MODEL = 'GigaChat-2-Pro'

  const modelModule = await importFreshModelModule()

  expect(modelModule.getUserSpecifiedModelSetting()).toBe('GigaChat-2-Pro')
  expect(modelModule.getDefaultMainLoopModelSetting()).toBe('GigaChat-2-Pro')
  expect(modelModule.getDefaultMainLoopModel()).toBe('GigaChat-2-Pro')
  expect(modelModule.getPublicModelDisplayName('GigaChat-2-Pro')).toBeNull()
})

test('gigachat provider falls back to GigaChat-2 when explicit model is missing', async () => {
  clearProviderEnv()
  process.env.CLAUDE_CODE_USE_GIGACHAT = '1'

  const modelModule = await importFreshModelModule()

  expect(modelModule.getDefaultMainLoopModelSetting()).toBe('GigaChat-2')
  expect(modelModule.getSmallFastModel()).toBe('GigaChat-2')
})
