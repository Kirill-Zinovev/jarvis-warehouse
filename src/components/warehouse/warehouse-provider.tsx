'use client'

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useWarehouseStore } from '@/store/warehouse-store'
import { Skeleton } from '@/components/ui/skeleton'
import type { FloorId } from '@/types/stock'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, RefreshCw, AlertCircle, Radio, Eye } from 'lucide-react'

interface SharedData {
  code: string
  name: string
  updatedAt: string
  records: { id: string; dateISO: string; displayDate: string; quantity: number; floor: string; createdAt?: string }[]
}

const POLL_INTERVAL = 10_000 // 10 seconds

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const setRecords = useWarehouseStore((s) => s.setRecords)
  const setCriticalThreshold = useWarehouseStore((s) => s.setCriticalThreshold)
  const setCurrentFloor = useWarehouseStore((s) => s.setCurrentFloor)
  const setLiveMode = useWarehouseStore((s) => s.setLiveMode)
  const liveMode = useWarehouseStore((s) => s.liveMode)
  const liveShareCode = useWarehouseStore((s) => s.liveShareCode)

  const [loading, setLoading] = useState(true)
  const [shareDialog, setShareDialog] = useState<{
    open: boolean
    code: string
    name: string
    records: SharedData['records']
    loading: boolean
    error: string | null
  }>({ open: false, code: '', name: '', records: [], loading: false, error: null })

  const loadFromDB = useCallback(async () => {
    const res = await fetch('/api/stock')
    if (res.ok) setRecords(await res.json())
  }, [setRecords])

  // Poll shared link for live updates
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollSharedData = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(code)}`)
      if (res.ok) {
        const data: SharedData = await res.json()
        if (data.records && data.records.length > 0) {
          setRecords(data.records)
        }
      }
    } catch {
      // Silent fail on poll — don't spam errors
    }
  }, [setRecords])

  // Start polling when liveMode is active
  useEffect(() => {
    if (liveMode && liveShareCode) {
      pollSharedData(liveShareCode)
      pollIntervalRef.current = setInterval(() => {
        pollSharedData(liveShareCode)
      }, POLL_INTERVAL)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [liveMode, liveShareCode, pollSharedData])

  useEffect(() => {
    async function init() {
      try {
        // Check for shared link in URL
        const params = new URLSearchParams(window.location.search)
        const code = params.get('s')

        if (code) {
          // Fetch shared data from server
          const res = await fetch(`/api/share/${encodeURIComponent(code)}`)
          if (res.ok) {
            const data: SharedData = await res.json()
            setShareDialog({
              open: true,
              code: data.code,
              name: data.name,
              records: data.records,
              loading: false,
              error: null,
            })
          } else {
            console.warn('Shared link not found, loading normally')
          }
          // Clean URL
          const url = new URL(window.location.href)
          url.searchParams.delete('s')
          window.history.replaceState({}, document.title, url.toString())
        }

        // Always load current DB state
        await loadFromDB()

        const saved = localStorage.getItem('criticalThreshold')
        if (saved) {
          const val = Number(saved)
          if (!isNaN(val) && val >= 0) setCriticalThreshold(val)
        }
      } catch (err) {
        console.error('Init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [loadFromDB, setRecords, setCriticalThreshold])

  // ---------- Shared link dialog handlers ----------
  async function handleImport() {
    setShareDialog(prev => ({ ...prev, loading: true, error: null }))
    try {
      // Re-fetch from server to get the latest data
      const res = await fetch(`/api/share/${encodeURIComponent(shareDialog.code)}`)
      if (!res.ok) throw new Error('Не удалось получить данные')

      const data: SharedData = await res.json()

      // Determine which floors are in the shared data
      const floors = [...new Set(data.records.map(r => r.floor))]
      const targetFloor = floors[0] || '1'

      // Delete current data for the floors being imported
      for (const floor of floors) {
        await fetch(`/api/stock?floor=${floor}`, { method: 'DELETE' })
      }

      // Import shared records via batch API
      const batchRes = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: data.records.map(r => ({ dateISO: r.dateISO, quantity: r.quantity, floor: r.floor })),
          replaceFloor: false,
        }),
      })
      if (!batchRes.ok) throw new Error('Ошибка импорта')

      setCurrentFloor(targetFloor as FloorId)
      await loadFromDB()
      setShareDialog(prev => ({ ...prev, open: false, loading: false }))
    } catch (err) {
      setShareDialog(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Ошибка при загрузке данных',
      }))
    }
  }

  function handleLiveView() {
    // Enter live mode — data will be polled every 10 seconds
    setLiveMode(true, shareDialog.code)
    // Load shared data immediately
    setRecords(shareDialog.records)
    const floors = [...new Set(shareDialog.records.map(r => r.floor))]
    setCurrentFloor((floors[0] || '1') as FloorId)
    setShareDialog(prev => ({ ...prev, open: false }))
  }

  function handleDismiss() {
    setShareDialog(prev => ({ ...prev, open: false }))
  }

  function exitLiveMode() {
    setLiveMode(false, null)
    loadFromDB()
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50/80 via-background to-green-50/60 dark:from-background dark:via-background dark:to-background">
        <main className="flex-1 max-w-[1500px] w-full mx-auto p-4 md:p-6">
          <div className="space-y-4">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-[300px] w-full rounded-xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <>
      {children}

      {/* Live mode indicator bar */}
      {liveMode && liveShareCode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 animate-pulse" />
            <span className="font-medium">Режим просмотра</span>
            <span className="opacity-80 hidden sm:inline">— данные обновляются каждые 10 сек</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={exitLiveMode}
            className="text-primary-foreground hover:bg-white/20 h-8 text-xs"
          >
            Выйти из просмотра
          </Button>
        </div>
      )}

      {/* Shared link dialog */}
      <Dialog open={shareDialog.open} onOpenChange={(open) => !open && handleDismiss()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Получены общие данные
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Кто-то поделился с вами актуальными данными склада.</p>

                <div className="space-y-1.5 rounded-lg bg-muted/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{shareDialog.name}</span>
                    <span className="text-muted-foreground">
                      {shareDialog.records.length} записей
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3" />
                    Обновлено: {formatTime(new Date().toISOString())}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  <strong>Импортировать</strong> — скопировать данные к себе (ваша текущая база будет заменена).
                  <br />
                  <strong>Смотреть в реальном времени</strong> — данные будут автоматически обновляться каждые 10 секунд.
                </p>

                {shareDialog.error && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    {shareDialog.error}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button variant="outline" onClick={handleDismiss} disabled={shareDialog.loading}>
              Отклонить
            </Button>
            <Button
              variant="outline"
              onClick={handleLiveView}
              className="border-primary/30 bg-primary/5 hover:bg-primary/10"
              disabled={shareDialog.loading}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Смотреть онлайн
            </Button>
            <Button onClick={handleImport} disabled={shareDialog.loading}>
              {shareDialog.loading ? 'Загрузка...' : 'Импортировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
