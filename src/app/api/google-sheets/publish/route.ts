import type { AppsScriptRequestPayload } from '@/lib/google-sheets'
import {
  checkRateLimit,
  getGoogleSheetsServerConfig,
  hasSameOrigin,
  hasValidSession,
  jsonResponse,
  readLimitedRequestText,
} from '@/lib/google-sheets-server'

export const dynamic = 'force-dynamic'

const MAX_REQUEST_CHARS = 5_000_000
const MAX_DIRECTIONS = 100
const MAX_ROWS = 20_000

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: 'Запрос отклонён.' }, 403)

  const config = await getGoogleSheetsServerConfig()
  if (!config) return jsonResponse({ error: 'Общий доступ к выгрузке ещё не настроен администратором.' }, 503)
  if (!await hasValidSession(request, config.sessionSecret)) {
    return jsonResponse({ error: 'PIN больше не действует. Введите его ещё раз.' }, 401)
  }

  try {
    const allowed = await checkRateLimit(config.writeRateLimiter, request, 'jarvis-google-export')
    if (!allowed) return jsonResponse({ error: 'Слишком много выгрузок. Подождите минуту и попробуйте снова.' }, 429)
  } catch {
    return jsonResponse({ error: 'Сервис защиты выгрузок временно недоступен.' }, 503)
  }

  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return jsonResponse({ error: 'Некорректный формат отчёта.' }, 415)
  }

  const rawBody = await readLimitedRequestText(request, MAX_REQUEST_CHARS)
  if (rawBody === null) return jsonResponse({ error: 'Отчёт слишком большой для одной выгрузки.' }, 413)
  if (!rawBody) return jsonResponse({ error: 'Пустой запрос.' }, 400)

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ error: 'Не удалось прочитать отчёт. Пересоберите направления и повторите.' }, 400)
  }

  const problem = validatePayload(payload)
  if (problem) return jsonResponse({ error: problem }, 400)

  try {
    const form = new URLSearchParams({
      token: config.appsScriptToken,
      payload: JSON.stringify(payload),
      response: 'json',
    })
    const upstream = await fetch(config.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    })

    const responseUrl = new URL(upstream.url)
    if (!upstream.ok || !['script.google.com', 'script.googleusercontent.com'].includes(responseUrl.hostname)) {
      return jsonResponse({ error: 'Google Apps Script не принял запрос. Проверьте его публикацию и доступ.' }, 502)
    }

    const responseText = await upstream.text()
    let result: unknown
    try {
      result = JSON.parse(responseText)
    } catch {
      return jsonResponse({ error: 'Google Apps Script отвечает старой версией. Администратору нужно обновить скрипт и его развёртывание.' }, 502)
    }

    if (!isAppsScriptResult(result)) {
      return jsonResponse({ error: 'Google Apps Script вернул неожиданный ответ. Проверьте установленную версию скрипта.' }, 502)
    }
    if (!result.success) {
      return jsonResponse({ success: false, title: result.title, message: result.message }, 422)
    }

    const summaryUrl = safeSummaryUrl(result.summaryUrl)
    return jsonResponse({
      success: true,
      title: result.title,
      message: result.message,
      summaryUrl,
    })
  } catch {
    return jsonResponse({ error: 'Не удалось связаться с Google. Проверьте интернет и попробуйте ещё раз.' }, 502)
  }
}

function validatePayload(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Структура отчёта повреждена.'
  const payload = value as Record<string, unknown>
  if (payload.action === 'test') {
    return validRequestId(payload.requestId) ? null : 'Номер проверки некорректен.'
  }
  if (payload.action !== 'publish' || !validRequestId(payload.requestId)) return 'Тип или номер выгрузки некорректен.'
  if (!Array.isArray(payload.directions) || !payload.directions.length || payload.directions.length > MAX_DIRECTIONS) {
    return 'Проверьте список направлений в отчёте.'
  }

  let rowCount = 0
  for (const direction of payload.directions) {
    if (!direction || typeof direction !== 'object') return 'Структура направления повреждена.'
    const item = direction as Record<string, unknown>
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 160
      || typeof item.sourceFileName !== 'string' || item.sourceFileName.length > 240
      || !Array.isArray(item.rows) || !item.rows.length) return 'Проверьте название и строки одного из направлений.'

    rowCount += item.rows.length
    if (rowCount > MAX_ROWS) return 'В одном отчёте слишком много строк.'
    for (const row of item.rows) {
      if (!row || typeof row !== 'object') return 'В отчёте найдена повреждённая строка.'
      const entry = row as Record<string, unknown>
      if (typeof entry.article !== 'string' || !entry.article.trim() || entry.article.length > 250
        || typeof entry.box !== 'string' || entry.box.length > 120
        || typeof entry.section !== 'string' || entry.section.length > 120
        || !['enough', 'shortage', 'not_found'].includes(String(entry.status))) {
        return 'Проверьте артикулы, коробки и участки в отчёте.'
      }
      for (const key of ['needed', 'available', 'allocated', 'remainingNeed', 'shortage']) {
        const amount = entry[key]
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
          return 'В отчёте найдены некорректные количества.'
        }
      }
    }
  }
  return null
}

function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
}

function isAppsScriptResult(value: unknown): value is {
  success: boolean
  title: string
  message: string
  summaryUrl?: string
} {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.success === 'boolean'
    && typeof result.title === 'string'
    && typeof result.message === 'string'
}

function safeSummaryUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'docs.google.com'
      && /^\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit$/.test(url.pathname)
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}
