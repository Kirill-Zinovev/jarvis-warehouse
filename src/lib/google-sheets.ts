import type { DirectionMatchResult, MatchResult, ShipmentDirection } from '@/types/jarvis'

export const JARVIS_SPREADSHEET_ID = '1_Q4b5ClVDpl0Q6UPmKZ_NKWv1ecAQU42YrGDkHZRrWU'
export const JARVIS_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${JARVIS_SPREADSHEET_ID}/edit`
export const APPS_SCRIPT_SOURCE_URL = '/jarvis-apps-script.gs'

export interface DirectionExportInput {
  result: DirectionMatchResult
  source: ShipmentDirection | undefined
}

export interface DirectionSummary {
  articles: number
  rows: number
  needed: number
  allocated: number
  shortage: number
  notFound: number
  missingSection: number
}

export interface ExportValidation {
  blocking: string[]
  warnings: string[]
}

export interface AppsScriptDirectionPayload {
  name: string
  sourceFileName: string
  rows: Array<Pick<MatchResult, 'article' | 'needed' | 'box' | 'section' | 'available' | 'allocated' | 'remainingNeed' | 'status' | 'shortage'>>
}

export interface AppsScriptPublishPayload {
  action: 'publish'
  requestId: string
  directions: AppsScriptDirectionPayload[]
}

export interface AppsScriptTestPayload {
  action: 'test'
  requestId: string
}

export type AppsScriptRequestPayload = AppsScriptPublishPayload | AppsScriptTestPayload

function normalizeName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\s\u200B-\u200D\uFEFF_-]+/g, '')
}

function statusForArticle(results: MatchResult[]) {
  const status = new Map<string, MatchResult['status']>()
  const shortage = new Map<string, number>()
  for (const result of results) {
    const current = status.get(result.article)
    if (!current || (current === 'enough' && result.status !== 'enough') || result.status === 'not_found') {
      status.set(result.article, result.status)
    }
    shortage.set(result.article, Math.max(shortage.get(result.article) ?? 0, result.shortage))
  }
  return { status, shortage }
}

export function getDirectionSummary(results: MatchResult[]): DirectionSummary {
  const byArticle = new Map<string, { needed: number; shortage: number; status: MatchResult['status'] }>()
  for (const result of results) {
    const existing = byArticle.get(result.article)
    if (existing) {
      existing.needed = Math.max(existing.needed, result.needed)
      existing.shortage = Math.max(existing.shortage, result.shortage)
      if (result.status === 'not_found' || (result.status === 'shortage' && existing.status === 'enough')) {
        existing.status = result.status
      }
    } else {
      byArticle.set(result.article, { needed: result.needed, shortage: result.shortage, status: result.status })
    }
  }

  return {
    articles: byArticle.size,
    rows: results.length,
    needed: Array.from(byArticle.values()).reduce((sum, item) => sum + item.needed, 0),
    allocated: results.reduce((sum, item) => sum + item.allocated, 0),
    shortage: Array.from(byArticle.values()).reduce((sum, item) => sum + item.shortage, 0),
    notFound: Array.from(byArticle.values()).filter((item) => item.status === 'not_found').length,
    missingSection: results.filter((item) => !item.section || item.section === '—').length,
  }
}

export function validateDirectionExport(directions: DirectionExportInput[]): ExportValidation {
  const blocking: string[] = []
  const warnings: string[] = []
  const names = new Map<string, string>()

  if (!directions.length) blocking.push('Нет отчётов для записи.')
  for (const { result, source } of directions) {
    const normalized = normalizeName(result.name)
    if (!normalized) blocking.push('У одного из направлений не указано название.')
    const previous = names.get(normalized)
    if (previous) blocking.push(`Названия «${previous}» и «${result.name}» совпадают — переименуйте направления, чтобы не перепутать вкладки.`)
    else names.set(normalized, result.name)
    if (!source) blocking.push(`Не найден исходный файл для направления «${result.name}». Пересоберите результат.`)
    if (!result.results.length) blocking.push(`В направлении «${result.name}» нет распознанных строк.`)

    const summary = getDirectionSummary(result.results)
    if (summary.notFound) warnings.push(`«${result.name}»: не найдено артикулов — ${summary.notFound}.`)
    if (summary.shortage) warnings.push(`«${result.name}»: дефицит — ${summary.shortage} шт.`)
    if (summary.missingSection) warnings.push(`«${result.name}»: у ${summary.missingSection} строк не определён участок.`)
  }
  return { blocking: Array.from(new Set(blocking)), warnings: Array.from(new Set(warnings)) }
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

export function buildAppsScriptPayload(
  directions: DirectionExportInput[],
  requestId: string,
): AppsScriptPublishPayload {
  return {
    action: 'publish',
    requestId,
    directions: directions.map(({ result, source }) => ({
      name: result.name,
      sourceFileName: source?.file.name ?? '',
      rows: result.results.map((row) => ({
        article: row.article,
        needed: row.needed,
        box: row.box,
        section: row.section,
        available: row.available,
        allocated: row.allocated,
        remainingNeed: row.remainingNeed,
        status: row.status,
        shortage: row.shortage,
      })),
    })),
  }
}

/**
 * Sends a classic form POST to the Apps Script web app. This avoids browser CORS
 * restrictions and opens the script's own success/error page in a new tab.
 */
export function openAppsScriptRequest(endpoint: string, accessCode: string, payload: AppsScriptRequestPayload) {
  const target = `jarvis-apps-script-${payload.requestId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const popup = window.open('about:blank', target, 'popup,width=580,height=720')
  if (!popup) throw new Error('Разрешите всплывающие окна для Jarvis, чтобы открыть результат отправки.')

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = endpoint
  form.target = target
  form.enctype = 'application/x-www-form-urlencoded'
  form.style.display = 'none'

  for (const [name, value] of Object.entries({ token: accessCode, payload: JSON.stringify(payload) })) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  document.body.appendChild(form)
  try {
    form.submit()
  } catch (error) {
    popup.close()
    throw error
  } finally {
    form.remove()
  }
  return target
}

export function createRequestId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
