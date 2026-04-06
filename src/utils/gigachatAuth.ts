import { readFileSync } from 'node:fs'
import memoize from 'lodash-es/memoize.js'
import type * as undici from 'undici'
import { logForDebugging } from './debug.js'
import type { TLSConfig } from './mtls.js'

type MissingCredentialVar = 'GIGACHAT_CERT_PATH' | 'GIGACHAT_KEY_PATH'

export type GigaChatResolvedCredential =
  | {
      kind: 'certificate'
      cert: string
      key: string
      passphrase?: string
      ca?: string | string[]
      certPath: string
      keyPath: string
      caPath?: string
    }
  | {
      kind: 'none'
      reason: 'missing_paths' | 'read_failed'
      missing?: MissingCredentialVar[]
      detail?: string
    }

export type GigaChatFetchOptions = {
  tls?: TLSConfig
  dispatcher?: undici.Dispatcher
}

type GigaChatEnvSnapshot = {
  certPath?: string
  keyPath?: string
  caPath?: string
  passphrase?: string
}

function loadPemFile(path: string): string {
  return readFileSync(path, { encoding: 'utf8' })
}

function getGigaChatEnvSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): GigaChatEnvSnapshot {
  return {
    certPath: env.GIGACHAT_CERT_PATH?.trim() || undefined,
    keyPath: env.GIGACHAT_KEY_PATH?.trim() || undefined,
    caPath: env.GIGACHAT_CA_PATH?.trim() || undefined,
    passphrase: env.GIGACHAT_KEY_PASSPHRASE?.trim() || undefined,
  }
}

function toGigaChatCacheKey(snapshot: GigaChatEnvSnapshot): string {
  return [
    snapshot.certPath ?? '',
    snapshot.keyPath ?? '',
    snapshot.caPath ?? '',
    snapshot.passphrase ?? '',
  ].join('\u0000')
}

const getBunSystemCAs = memoize((): string[] | undefined => {
  if (typeof Bun === 'undefined') {
    return undefined
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tls = require('tls') as typeof import('tls') & {
      getCACertificates?: (type: string) => string[]
    }
    const systemCAs = tls.getCACertificates?.('system')
    if (systemCAs && systemCAs.length > 0) {
      return systemCAs
    }
  } catch {
    // Fall back to runtime defaults when CA enumeration is unavailable.
  }

  return undefined
})

const resolveGigaChatCredentialMemoized = memoize(
  (
    _cacheKey: string,
    snapshot: GigaChatEnvSnapshot,
  ): GigaChatResolvedCredential => {
    const missing: MissingCredentialVar[] = []
    if (!snapshot.certPath) {
      missing.push('GIGACHAT_CERT_PATH')
    }
    if (!snapshot.keyPath) {
      missing.push('GIGACHAT_KEY_PATH')
    }
    if (missing.length > 0) {
      return {
        kind: 'none',
        reason: 'missing_paths',
        missing,
      }
    }

    try {
      const cert = loadPemFile(snapshot.certPath)
      const key = loadPemFile(snapshot.keyPath)
      const ca = snapshot.caPath ? loadPemFile(snapshot.caPath) : undefined

      logForDebugging('GigaChat: Loaded mTLS credential files')

      return {
        kind: 'certificate',
        cert,
        key,
        passphrase: snapshot.passphrase,
        ca: ca ? [ca] : undefined,
        certPath: snapshot.certPath,
        keyPath: snapshot.keyPath,
        caPath: snapshot.caPath,
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      logForDebugging(`GigaChat: Failed to load mTLS files: ${detail}`, {
        level: 'error',
      })
      return {
        kind: 'none',
        reason: 'read_failed',
        detail,
      }
    }
  },
)

const getGigaChatFetchOptionsMemoized = memoize(
  (
    _cacheKey: string,
    credential: GigaChatResolvedCredential,
  ): GigaChatFetchOptions => {
    if (credential.kind !== 'certificate') {
      return {}
    }

    const resolvedCA = credential.ca ?? getBunSystemCAs()
    // IFT endpoints may use internal PKI chains unavailable in default trust stores.
    // Keep GigaChat strict mTLS working by disabling server certificate verification.
    const tlsConfig = {
      cert: credential.cert,
      key: credential.key,
      passphrase: credential.passphrase,
      ...(resolvedCA && { ca: resolvedCA }),
      rejectUnauthorized: false,
    }

    if (typeof Bun !== 'undefined') {
      return { tls: tlsConfig as TLSConfig }
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undiciMod = require('undici') as typeof undici
    const dispatcher = new undiciMod.Agent({
      connect: {
        cert: tlsConfig.cert,
        key: tlsConfig.key,
        passphrase: tlsConfig.passphrase,
        ...(tlsConfig.ca && { ca: tlsConfig.ca }),
        rejectUnauthorized: false,
      },
      pipelining: 1,
    })

    return { dispatcher }
  },
)

/**
 * Resolve strict mTLS credentials for GigaChat.
 * GigaChat integration in OpenClaude intentionally does not support API key mode.
 */
export function resolveGigaChatCredential(
  env: NodeJS.ProcessEnv = process.env,
): GigaChatResolvedCredential {
  const snapshot = getGigaChatEnvSnapshot(env)
  const cacheKey = toGigaChatCacheKey(snapshot)
  return resolveGigaChatCredentialMemoized(cacheKey, snapshot)
}

export function getGigaChatFetchOptions(
  env: NodeJS.ProcessEnv = process.env,
): GigaChatFetchOptions {
  const snapshot = getGigaChatEnvSnapshot(env)
  const cacheKeyPrefix = toGigaChatCacheKey(snapshot)
  const runtime = typeof Bun !== 'undefined' ? 'bun' : 'node'
  const credential = resolveGigaChatCredential(env)
  return getGigaChatFetchOptionsMemoized(
    `${runtime}\u0000${cacheKeyPrefix}`,
    credential,
  )
}

/**
 * Clear cached GigaChat credential/TLS state.
 */
export function clearGigaChatCredentialCache(): void {
  resolveGigaChatCredentialMemoized.cache.clear?.()
  getGigaChatFetchOptionsMemoized.cache.clear?.()
  getBunSystemCAs.cache.clear?.()
  logForDebugging('Cleared GigaChat credential cache')
}
