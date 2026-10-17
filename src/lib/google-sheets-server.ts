import { getCloudflareContext } from '@opennextjs/cloudflare'

const COOKIE_NAME = 'jarvis_google_export_session'
const SESSION_TTL_SECONDS = 12 * 60 * 60
const SESSION_VERSION = 'v1'

type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

type WorkerSecrets = Record<string, unknown> & {
  JARVIS_EXPORT_PIN_RATE_LIMITER?: RateLimitBinding
  JARVIS_EXPORT_WRITE_RATE_LIMITER?: RateLimitBinding
}

export interface GoogleSheetsServerConfig {
  pin: string
  sessionSecret: string
  appsScriptUrl: string
  appsScriptToken: string
  pinRateLimiter?: RateLimitBinding
  writeRateLimiter?: RateLimitBinding
}

export async function getGoogleSheetsServerConfig(): Promise<GoogleSheetsServerConfig | null> {
  let env = process.env as Record<string, unknown>
  try {
    const context = await getCloudflareContext({ async: true })
    env = { ...env, ...(context.env as unknown as Record<string, unknown>) }
  } catch {
    // `next dev` does not always initialize the Cloudflare context; local .env values remain usable.
  }

  const pin = stringValue(env.JARVIS_EXPORT_PIN)
  const sessionSecret = stringValue(env.JARVIS_EXPORT_SESSION_SECRET)
  const appsScriptUrl = stringValue(env.JARVIS_APPS_SCRIPT_URL)
  const appsScriptToken = stringValue(env.JARVIS_APPS_SCRIPT_TOKEN)

  if (pin.length < 8 || pin.length > 128
    || sessionSecret.length < 32
    || !isAppsScriptWebAppUrl(appsScriptUrl)
    || appsScriptToken.length < 32) {
    return null
  }

  const bindings = env as WorkerSecrets
  return {
    pin,
    sessionSecret,
    appsScriptUrl,
    appsScriptToken,
    pinRateLimiter: bindings.JARVIS_EXPORT_PIN_RATE_LIMITER,
    writeRateLimiter: bindings.JARVIS_EXPORT_WRITE_RATE_LIMITER,
  }
}

export function isAppsScriptWebAppUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'script.google.com'
      && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url.pathname)
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}

export function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store, max-age=0')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(data), { status, headers })
}

export async function readLimitedRequestText(request: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > maxBytes) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export async function issueSessionCookie(request: Request, secret: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const message = `${SESSION_VERSION}.${expiresAt}.${nonce}`
  const signature = await sign(message, secret)
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE_NAME}=${message}.${signature}; Path=/api/google-sheets; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`
}

export function expiredSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE_NAME}=; Path=/api/google-sheets; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
}

export async function hasValidSession(request: Request, secret: string) {
  const value = cookieValue(request.headers.get('cookie') || '', COOKIE_NAME)
  if (!value) return false

  const [version, expiresText, nonce, signature, extra] = value.split('.')
  if (version !== SESSION_VERSION || extra !== undefined
    || !/^\d{10}$/.test(expiresText || '')
    || !/^[a-f0-9]{32}$/.test(nonce || '')
    || !/^[a-f0-9]{64}$/.test(signature || '')) return false

  const expiresAt = Number(expiresText)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_TTL_SECONDS + 60) return false

  return verify(`${version}.${expiresText}.${nonce}`, signature, secret)
}

export function constantTimeEquals(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let difference = leftBytes.length ^ rightBytes.length
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0)
  }
  return difference === 0
}

export async function checkRateLimit(binding: RateLimitBinding | undefined, request: Request, fallbackKey: string) {
  if (!binding) return true
  const key = request.headers.get('cf-connecting-ip') || fallbackKey
  const result = await binding.limit({ key })
  return result.success
}

function cookieValue(cookieHeader: string, name: string) {
  const prefix = `${name}=`
  const item = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))
  return item?.slice(prefix.length) || ''
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function sign(message: string, secret: string) {
  const key = await importHmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bytesToHex(new Uint8Array(signature))
}

async function verify(message: string, signature: string, secret: string) {
  const key = await importHmacKey(secret)
  return crypto.subtle.verify('HMAC', key, hexToBytes(signature), new TextEncoder().encode(message))
}

function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}
