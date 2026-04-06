import { readFileSync } from 'node:fs'
import memoize from 'lodash-es/memoize.js'
import { logForDebugging } from './debug.js'

export type GigaChatAuthMode = 'certificate' | 'api-key'

export type GigaChatResolvedCredential =
  | {
      kind: 'certificate'
      cert: string
      key: string
      passphrase?: string
      ca?: string | string[]
    }
  | {
      kind: 'api-key'
      credential: string
    }
  | {
      kind: 'none'
    }

/**
 * Get GigaChat authentication mode from environment variables
 */
export function getGigaChatAuthMode(
  env: NodeJS.ProcessEnv = process.env,
): GigaChatAuthMode | undefined {
  const normalized = env.GIGACHAT_AUTH_MODE?.trim().toLowerCase()
  if (normalized === 'certificate' || normalized === 'api-key') {
    return normalized
  }
  // Default to certificate mode if certificate paths are provided
  if (env.GIGACHAT_CERT_PATH || env.GIGACHAT_KEY_PATH) {
    return 'certificate'
  }
  // Default to api-key mode if API key is provided
  if (env.GIGACHAT_API_KEY) {
    return 'api-key'
  }
  return undefined
}

/**
 * Load certificate content from file path
 */
function loadCertificateFile(path: string | undefined): string | undefined {
  if (!path) return undefined
  try {
    const content = readFileSync(path.trim(), { encoding: 'utf8' })
    logForDebugging(`GigaChat: Loaded certificate from ${path}`)
    return content
  } catch (error) {
    logForDebugging(`GigaChat: Failed to load certificate from ${path}: ${error}`, {
      level: 'error',
    })
    return undefined
  }
}

/**
 * Resolve GigaChat credentials from environment variables
 * Supports both certificate-based and API key authentication
 */
export const resolveGigaChatCredential = memoize(
  (env: NodeJS.ProcessEnv = process.env): GigaChatResolvedCredential => {
    const authMode = getGigaChatAuthMode(env)

    // Certificate-based authentication
    if (authMode === 'certificate' || !authMode) {
      const certPath = env.GIGACHAT_CERT_PATH?.trim()
      const keyPath = env.GIGACHAT_KEY_PATH?.trim()
      const passphrase = env.GIGACHAT_KEY_PASSPHRASE?.trim()
      const caPath = env.GIGACHAT_CA_PATH?.trim()

      if (certPath && keyPath) {
        const cert = loadCertificateFile(certPath)
        const key = loadCertificateFile(keyPath)
        
        if (cert && key) {
          const ca = caPath ? loadCertificateFile(caPath) : undefined
          
          return {
            kind: 'certificate',
            cert,
            key,
            passphrase: passphrase || undefined,
            ca: ca ? [ca] : undefined,
          }
        }
      }
    }

    // API key authentication (fallback)
    if (authMode === 'api-key' || !authMode) {
      const apiKey = env.GIGACHAT_API_KEY?.trim()
      if (apiKey) {
        return {
          kind: 'api-key',
          credential: apiKey,
        }
      }
    }

    return { kind: 'none' }
  },
)

/**
 * Clear the GigaChat credential cache
 */
export function clearGigaChatCredentialCache(): void {
  resolveGigaChatCredential.cache.clear?.()
  logForDebugging('Cleared GigaChat credential cache')
}
