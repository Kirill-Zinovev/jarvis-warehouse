import {
  checkRateLimit,
  constantTimeEquals,
  expiredSessionCookie,
  getGoogleSheetsServerConfig,
  hasSameOrigin,
  hasValidSession,
  issueSessionCookie,
  jsonResponse,
  readLimitedRequestText,
} from '@/lib/google-sheets-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const config = await getGoogleSheetsServerConfig()
  return jsonResponse({
    configured: Boolean(config),
    authorized: config ? await hasValidSession(request, config.sessionSecret) : false,
  })
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: 'Запрос отклонён.' }, 403)

  const config = await getGoogleSheetsServerConfig()
  if (!config) return jsonResponse({ error: 'Общий доступ к выгрузке ещё не настроен администратором.' }, 503)

  try {
    const allowed = await checkRateLimit(config.pinRateLimiter, request, 'jarvis-pin-login')
    if (!allowed) return jsonResponse({ error: 'Слишком много попыток. Подождите минуту и попробуйте снова.' }, 429)
  } catch {
    return jsonResponse({ error: 'Сервис проверки доступа временно недоступен.' }, 503)
  }

  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return jsonResponse({ error: 'Некорректный формат запроса.' }, 415)
  }
  const rawBody = await readLimitedRequestText(request, 512)
  if (rawBody === null) return jsonResponse({ error: 'Некорректный запрос.' }, 413)

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Введите PIN команды.' }, 400)
  }

  const pin = body && typeof body === 'object' && 'pin' in body && typeof body.pin === 'string'
    ? body.pin.slice(0, 129)
    : ''
  if (!constantTimeEquals(pin, config.pin)) return jsonResponse({ error: 'Неверный PIN команды.' }, 401)

  return jsonResponse({ authorized: true }, 200, {
    'Set-Cookie': await issueSessionCookie(request, config.sessionSecret),
  })
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: 'Запрос отклонён.' }, 403)
  return jsonResponse({ authorized: false }, 200, { 'Set-Cookie': expiredSessionCookie(request) })
}
