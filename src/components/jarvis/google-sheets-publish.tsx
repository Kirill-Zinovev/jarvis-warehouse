'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudUpload, ExternalLink, FileDown, KeyRound, LoaderCircle, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DirectionMatchResult, ShipmentDirection } from '@/types/jarvis'
import {
  APPS_SCRIPT_SOURCE_URL,
  JARVIS_OUTPUT_FOLDER_URL,
  JARVIS_SPREADSHEET_URL,
  buildAppsScriptPayload,
  createRequestId,
  isAppsScriptWebAppUrl,
  openAppsScriptRequest,
  validateDirectionExport,
} from '@/lib/google-sheets'
import type { AppsScriptRequestPayload, DirectionExportInput } from '@/lib/google-sheets'
import { cn } from '@/lib/utils'

const APPS_SCRIPT_CONFIG_KEY = 'jarvis-apps-script-config-v1'

interface AppsScriptConfig {
  endpoint: string
  accessCode: string
}

export function GoogleSheetsPublish({
  directions,
  sourceDirections,
}: {
  directions: DirectionMatchResult[]
  sourceDirections: ShipmentDirection[]
}) {
  const [endpoint, setEndpoint] = useState('')
  const [endpointDraft, setEndpointDraft] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [accessCodeDraft, setAccessCodeDraft] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmWarnings, setConfirmWarnings] = useState(false)
  const [lastAction, setLastAction] = useState<'test' | 'publish' | null>(null)
  const configured = Boolean(endpoint && accessCode)

  const inputDirections = useMemo<DirectionExportInput[]>(() => directions.map((result) => ({
    result,
    source: sourceDirections.find((direction) => direction.id === result.id),
  })), [directions, sourceDirections])
  const validation = useMemo(() => validateDirectionExport(inputDirections), [inputDirections])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(APPS_SCRIPT_CONFIG_KEY)
      if (!saved) return
      const config = JSON.parse(saved) as Partial<AppsScriptConfig>
      const savedEndpoint = config.endpoint
      const savedAccessCode = config.accessCode
      if (typeof savedEndpoint === 'string' && isAppsScriptWebAppUrl(savedEndpoint)
        && typeof savedAccessCode === 'string' && savedAccessCode.length >= 32) {
        const timer = window.setTimeout(() => {
          setEndpoint(savedEndpoint)
          setEndpointDraft(savedEndpoint)
          setAccessCode(savedAccessCode)
          setAccessCodeDraft(savedAccessCode)
        }, 0)
        return () => window.clearTimeout(timer)
      }
    } catch {
      try { window.localStorage.removeItem(APPS_SCRIPT_CONFIG_KEY) } catch { /* Storage can be disabled by browser policy. */ }
    }
  }, [])

  const saveSettings = () => {
    const cleanEndpoint = endpointDraft.trim().replace(/\/$/, '')
    const cleanAccessCode = accessCodeDraft.trim()
    if (!isAppsScriptWebAppUrl(cleanEndpoint)) {
      toast.error('Вставьте ссылку развернутого Apps Script, которая заканчивается на /exec.')
      return
    }
    if (cleanAccessCode.length < 32) {
      toast.error('Код доступа слишком короткий. Скопируйте его через меню Jarvis в таблице.')
      return
    }
    try {
      const config = { endpoint: cleanEndpoint, accessCode: cleanAccessCode }
      window.localStorage.setItem(APPS_SCRIPT_CONFIG_KEY, JSON.stringify(config))
      setEndpoint(cleanEndpoint)
      setEndpointDraft(cleanEndpoint)
      setAccessCode(cleanAccessCode)
      setAccessCodeDraft(cleanAccessCode)
      setLastAction(null)
      setSettingsOpen(false)
      toast.success('Связь с таблицей настроена в этом браузере')
    } catch {
      toast.error('Браузер не смог сохранить настройки. Разрешите локальное хранилище и попробуйте ещё раз.')
    }
  }

  const sendAppsScriptRequest = (payload: AppsScriptRequestPayload) => {
    if (!configured) {
      toast.error('Сначала настройте связь с Google Таблицей.')
      setSettingsOpen(true)
      return
    }
    try {
      setSaving(true)
      openAppsScriptRequest(endpoint, accessCode, payload)
      setLastAction(payload.action)
      setConfirmWarnings(false)
      toast.info(payload.action === 'test'
        ? 'Проверка открылась в новой вкладке. Там появится результат.'
        : 'Отправка открылась в новой вкладке. Дождитесь ссылки на созданную таблицу.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось открыть отправку в Google Таблицу.')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = () => {
    sendAppsScriptRequest({ action: 'test', requestId: createRequestId() })
  }

  const publish = () => {
    if (validation.blocking.length) {
      toast.error('Сначала исправьте замечания в списке направлений.')
      return
    }
    if (!configured) {
      toast.error('Сначала настройте связь с Google Таблицей.')
      setSettingsOpen(true)
      return
    }
    if (validation.warnings.length && !confirmWarnings) {
      setConfirmWarnings(true)
      return
    }
    sendAppsScriptRequest(buildAppsScriptPayload(inputDirections, createRequestId()))
  }

  return (
    <section className="rounded-xl border border-[#dfe6ef] bg-white p-4 shadow-none sm:p-5" aria-labelledby="google-sheets-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf4ff] text-[#2b73d2]"><CloudUpload className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="google-sheets-title" className="font-bold text-[#15274f]">Выгрузить в Google Таблицу</h2>
            <p className="mt-1 text-xs leading-5 text-[#71819a]">Отдельная таблица с вкладками по городам и сводкой сохранится в твоём Google Диске. Таблицу-шаблон не изменяем.</p>
            <a href={JARVIS_OUTPUT_FOLDER_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2b73d2] hover:underline">
              Папка выгрузок «Jarvis — отчёты» <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a href={JARVIS_SPREADSHEET_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2b73d2] hover:underline">
              Открыть таблицу-шаблон «Кирилл» <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {configured && <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf9f1] px-2.5 py-1 text-[11px] font-semibold text-[#168653]"><CheckCircle2 className="h-3.5 w-3.5" />Данные сохранены</span>}
          {configured && <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={saving} className="h-8 border-[#cbd5e1] text-xs text-[#344666]">Проверить связь</Button>}
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen((open) => !open)} className="h-8 border-[#cbd5e1] text-xs text-[#344666]">
            <Settings2 className="h-4 w-4" />{configured ? 'Настройки' : 'Подключить таблицу'}
          </Button>
        </div>
      </div>

      {settingsOpen && (
        <div className="mt-4 rounded-lg border border-[#dfe6ef] bg-[#f8fafc] p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#344666]">Настройка один раз — без OAuth Client ID</p>
              <p className="mt-1 text-xs text-[#71819a]">Каждая выгрузка создаёт отдельную таблицу; исходный шаблон остаётся без изменений.</p>
            </div>
            <a href={APPS_SCRIPT_SOURCE_URL} download="Jarvis-Apps-Script.gs" className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#344666] hover:bg-[#f3f6fa]">
              <FileDown className="h-3.5 w-3.5" />Скачать скрипт
            </a>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-[#71819a]">
            <li>В таблице откройте «Расширения → Apps Script», создайте отдельный файл, вставьте скачанный код и сохраните.</li>
            <li>Вернитесь в таблицу, обновите её и выберите «Jarvis → Показать код доступа».</li>
            <li>В Apps Script нажмите «Развернуть → Новое развертывание → Веб-приложение». Запускать от вашего имени; доступ — «Все».</li>
            <li>Скопируйте адрес веб-приложения и код доступа в поля ниже.</li>
          </ol>
          <p className="mt-2 text-[11px] leading-4 text-[#8794a8]">При первом запуске Google попросит разрешить доступ к таблицам и Google Drive — это нужно, чтобы создать отдельный файл и скопировать формат листов.</p>
          <label htmlFor="jarvis-apps-script-url" className="mt-3 block text-xs font-semibold text-[#53647e]">Адрес веб-приложения</label>
          <input
            id="jarvis-apps-script-url"
            value={endpointDraft}
            onChange={(event) => setEndpointDraft(event.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            autoComplete="url"
            inputMode="url"
            className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] bg-white px-3 text-xs text-[#15274f] outline-none focus:border-[#2b73d2] focus:ring-2 focus:ring-[#2b73d2]/10"
          />
          <label htmlFor="jarvis-apps-script-code" className="mt-3 block text-xs font-semibold text-[#53647e]">Код доступа из таблицы</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="jarvis-apps-script-code"
              type="password"
              value={accessCodeDraft}
              onChange={(event) => setAccessCodeDraft(event.target.value)}
              placeholder="Вставьте код из меню Jarvis в таблице"
              autoComplete="new-password"
              className="h-9 min-w-0 flex-1 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs text-[#15274f] outline-none focus:border-[#2b73d2] focus:ring-2 focus:ring-[#2b73d2]/10"
            />
            <Button type="button" size="sm" onClick={saveSettings} className="h-9 bg-[#2563a9] text-white hover:bg-[#1d4f88]">Сохранить</Button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-[#8794a8]"><KeyRound className="mt-0.5 h-3 w-3 shrink-0" />Код доступа действует как пароль к отправке. Он сохранится только в этом браузере и не попадёт в код сайта. Не отправляйте его в чат.</p>
        </div>
      )}

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
            {lastAction && <p role="status" className="mt-1 text-[11px] font-semibold text-[#168653]">{lastAction === 'test' ? 'Проверка открыта в Apps Script — посмотрите результат в новой вкладке.' : 'Отправка открыта в Apps Script — дождитесь ссылки на отдельную Google Таблицу.'}</p>}
          </div>
          {configured ? (
            <Button
              type="button"
              disabled={saving || validation.blocking.length > 0}
              onClick={publish}
              className={cn('h-10 shrink-0 bg-[#2563a9] px-4 text-xs font-bold text-white hover:bg-[#1d4f88]', saving && 'cursor-wait')}
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              {saving ? 'Открываю…' : confirmWarnings ? 'Подтвердить выгрузку' : validation.warnings.length ? 'Проверить и выгрузить' : 'Выгрузить в Google Таблицу'}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)} className="h-10 shrink-0 border-[#cbd5e1] text-xs text-[#344666]">
              <Settings2 className="h-4 w-4" />Настроить один раз
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
