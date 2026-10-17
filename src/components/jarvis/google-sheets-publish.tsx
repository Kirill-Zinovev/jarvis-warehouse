'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudUpload, ExternalLink, KeyRound, LoaderCircle, LogOut, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DirectionMatchResult, ShipmentDirection } from '@/types/jarvis'
import {
  JARVIS_OUTPUT_FOLDER_URL,
  JARVIS_SPREADSHEET_URL,
  buildAppsScriptPayload,
  createRequestId,
  validateDirectionExport,
} from '@/lib/google-sheets'
import type { AppsScriptRequestPayload, DirectionExportInput } from '@/lib/google-sheets'
import { cn } from '@/lib/utils'

const LEGACY_CONFIG_KEY = 'jarvis-apps-script-config-v1'

interface SessionStatus {
  configured: boolean
  authorized: boolean
}

interface PublishResponse {
  success?: boolean
  title?: string
  message?: string
  summaryUrl?: string
  error?: string
}

export function GoogleSheetsPublish({
  directions,
  sourceDirections,
}: {
  directions: DirectionMatchResult[]
  sourceDirections: ShipmentDirection[]
}) {
  const [pin, setPin] = useState('')
  const [session, setSession] = useState<SessionStatus>({ configured: false, authorized: false })
  const [checking, setChecking] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmWarnings, setConfirmWarnings] = useState(false)
  const [lastAction, setLastAction] = useState<'test' | 'publish' | null>(null)
  const [lastMessage, setLastMessage] = useState('')
  const [summaryUrl, setSummaryUrl] = useState('')
  const [serverError, setServerError] = useState('')

  const inputDirections = useMemo<DirectionExportInput[]>(() => directions.map((result) => ({
    result,
    source: sourceDirections.find((direction) => direction.id === result.id),
  })), [directions, sourceDirections])
  const validation = useMemo(() => validateDirectionExport(inputDirections), [inputDirections])

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/google-sheets/session', { cache: 'no-store' })
      const result = await response.json() as SessionStatus
      if (!response.ok) throw new Error('Не удалось проверить доступ к выгрузке.')
      setServerError('')
      setSession({ configured: Boolean(result.configured), authorized: Boolean(result.authorized) })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Нет связи с сервером Jarvis.')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    try { window.localStorage.removeItem(LEGACY_CONFIG_KEY) } catch { /* Browser storage may be disabled. */ }
    const timer = window.setTimeout(() => { void refreshSession() }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshSession])

  const unlockExport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pin.trim()) {
      toast.error('Введите общий PIN команды.')
      return
    }
    setAuthBusy(true)
    try {
      const response = await fetch('/api/google-sheets/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const result = await response.json() as PublishResponse
      if (!response.ok) throw new Error(result.error || 'Не удалось открыть доступ к выгрузке.')
      setPin('')
      await refreshSession()
      toast.success('Доступ к выгрузке открыт на 12 часов')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось проверить PIN.')
    } finally {
      setAuthBusy(false)
    }
  }

  const lockExport = async () => {
    setAuthBusy(true)
    try {
      const response = await fetch('/api/google-sheets/session', { method: 'DELETE' })
      if (!response.ok) throw new Error('Не удалось закрыть доступ.')
      setSession((current) => ({ ...current, authorized: false }))
      setSummaryUrl('')
      setLastMessage('')
      toast.success('Доступ закрыт на этом устройстве')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось закрыть доступ.')
    } finally {
      setAuthBusy(false)
    }
  }

  const sendAppsScriptRequest = async (payload: AppsScriptRequestPayload) => {
    if (!session.authorized) {
      toast.error('Введите общий PIN команды, чтобы открыть выгрузку.')
      return
    }
    setSaving(true)
    setLastMessage('')
    setSummaryUrl('')
    try {
      const response = await fetch('/api/google-sheets/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as PublishResponse
      if (response.status === 401) {
        setSession((current) => ({ ...current, authorized: false }))
      }
      if (!response.ok || !result.success) throw new Error(result.error || result.message || 'Не удалось выполнить запрос в Google.')

      setLastAction(payload.action)
      setLastMessage(result.message || (payload.action === 'test' ? 'Связь с Google работает.' : 'Отчёт создан.'))
      setSummaryUrl(result.summaryUrl || '')
      setConfirmWarnings(false)
      if (payload.action === 'test') toast.success('Связь с Google Таблицей работает')
      else toast.success('Отчёт создан в Google Таблице')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось выполнить выгрузку.')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = () => {
    void sendAppsScriptRequest({ action: 'test', requestId: createRequestId() })
  }

  const publish = () => {
    if (validation.blocking.length) {
      toast.error('Сначала исправьте замечания в списке направлений.')
      return
    }
    if (validation.warnings.length && !confirmWarnings) {
      setConfirmWarnings(true)
      return
    }
    void sendAppsScriptRequest(buildAppsScriptPayload(inputDirections, createRequestId()))
  }

  return (
    <section className="rounded-xl border border-[#dfe6ef] bg-white p-4 shadow-none sm:p-5" aria-labelledby="google-sheets-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf4ff] text-[#2b73d2]"><CloudUpload className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="google-sheets-title" className="font-bold text-[#15274f]">Выгрузить в Google Таблицу</h2>
            <p className="mt-1 text-xs leading-5 text-[#71819a]">Все направления попадут в отдельную таблицу с городскими листами и сводкой в твоём Google Диске.</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <a href={JARVIS_OUTPUT_FOLDER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#2b73d2] hover:underline">
                Папка отчётов <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a href={JARVIS_SPREADSHEET_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#2b73d2] hover:underline">
                Таблица-шаблон <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        {session.authorized && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf9f1] px-2.5 py-1 text-[11px] font-semibold text-[#168653]"><CheckCircle2 className="h-3.5 w-3.5" />Доступ открыт</span>
            <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={saving} className="h-8 border-[#cbd5e1] text-xs text-[#344666]">Проверить связь</Button>
            <Button type="button" variant="ghost" size="sm" onClick={lockExport} disabled={authBusy} className="h-8 text-xs text-[#71819a]"><LogOut className="h-3.5 w-3.5" />Выйти</Button>
          </div>
        )}
      </div>

      {checking ? (
        <div role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-[#dfe6ef] bg-[#f8fafc] px-3 py-3 text-xs text-[#71819a]"><LoaderCircle className="h-4 w-4 animate-spin" />Проверяем доступ к выгрузке…</div>
      ) : serverError ? (
        <div role="alert" className="mt-4 rounded-lg border border-[#fecaca] bg-[#fff7f7] px-3 py-3 text-xs text-[#b4233f]">{serverError}</div>
      ) : !session.configured ? (
        <div role="status" className="mt-4 rounded-lg border border-[#f3dfb7] bg-[#fffbf2] px-3 py-3 text-xs leading-5 text-[#8a5a06]">
          <p className="font-semibold">Общая выгрузка пока не подключена.</p>
          <p className="mt-1">Администратору нужно один раз настроить Apps Script и секреты Worker в Cloudflare. Сотрудникам адрес и код Apps Script вводить не потребуется.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-semibold">
            <a href="/jarvis-apps-script.gs" download="Jarvis-Apps-Script.gs" className="text-[#2b73d2] hover:underline">Скачать скрипт для таблицы</a>
            <a href="https://github.com/Kirill-Zinovev/jarvis-warehouse/blob/main/docs/google-sheets-shared-export.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#2b73d2] hover:underline">Инструкция администратору <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </div>
      ) : !session.authorized ? (
        <form onSubmit={unlockExport} className="mt-4 flex flex-col gap-2 rounded-lg border border-[#dfe6ef] bg-[#f8fafc] p-3 sm:flex-row sm:items-end sm:p-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="jarvis-team-pin" className="flex items-center gap-1.5 text-xs font-semibold text-[#53647e]"><KeyRound className="h-3.5 w-3.5" />Общий PIN команды</label>
            <input
              id="jarvis-team-pin"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Введите PIN, выданный администратором"
              autoComplete="current-password"
              maxLength={128}
              className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] bg-white px-3 text-xs text-[#15274f] outline-none focus:border-[#2b73d2] focus:ring-2 focus:ring-[#2b73d2]/10"
            />
            <p className="mt-1 text-[11px] text-[#8794a8]">PIN не сохраняется в браузере. Доступ на этом устройстве действует 12 часов.</p>
          </div>
          <Button type="submit" disabled={authBusy || !pin.trim()} className="h-9 shrink-0 bg-[#2563a9] text-xs font-semibold text-white hover:bg-[#1d4f88]">
            {authBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Открыть выгрузку
          </Button>
        </form>
      ) : null}

      <div className="mt-4 border-t border-[#edf1f5] pt-4">
        {validation.blocking.length > 0 && (
          <div role="alert" className="mb-3 rounded-md border border-[#fecaca] bg-[#fff7f7] p-3 text-xs text-[#b4233f]">
            <p className="font-bold">Нельзя записать — сначала исправьте:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">{validation.blocking.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        )}
        {validation.warnings.length > 0 && (
          <div className="mb-3 rounded-md border border-[#f3dfb7] bg-[#fffbf2] p-3 text-xs text-[#9a6100]">
            <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-3.5 w-3.5" />Перед записью проверьте результаты</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">{validation.warnings.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] leading-5 text-[#8190a7]">Направлений в отдельной таблице: {directions.length}. Порядок списка сохраняется, отправляется только рассчитанный отчёт.</p>
            {lastAction && <p role="status" className="mt-1 text-[11px] font-semibold text-[#168653]">{lastMessage}</p>}
            {summaryUrl && <a href={summaryUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#2b73d2] hover:underline">Открыть созданную таблицу <ExternalLink className="h-3.5 w-3.5" /></a>}
          </div>
          <Button
            type="button"
            disabled={!session.authorized || saving || validation.blocking.length > 0}
            onClick={publish}
            title={!session.authorized ? 'Сначала введите общий PIN команды' : undefined}
            className={cn('h-10 shrink-0 bg-[#2563a9] px-4 text-xs font-bold text-white hover:bg-[#1d4f88]', saving && 'cursor-wait')}
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            {saving ? 'Создаём таблицу…' : confirmWarnings ? 'Подтвердить выгрузку' : validation.warnings.length ? 'Проверить и выгрузить' : 'Выгрузить в Google Таблицу'}
          </Button>
        </div>
      </div>
    </section>
  )
}
