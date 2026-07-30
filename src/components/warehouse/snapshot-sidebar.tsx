'use client'

import { useState, useEffect, useCallback } from 'react'
import { Camera, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWarehouseStore } from '@/store/warehouse-store'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface Snapshot {
  id: string
  name: string
  floor: string
  records: { dateISO: string; displayDate: string; quantity: number }[]
  createdAt: string
}

export function SnapshotSidebar() {
  const records = useWarehouseStore((s) => s.records)
  const currentFloor = useWarehouseStore((s) => s.currentFloor)
  const setRecords = useWarehouseStore((s) => s.setRecords)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [saving, setSaving] = useState(false)

  const floorRecords = records.filter((r) => r.floor === currentFloor)

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/snapshots?floor=${currentFloor}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSnapshots(data)
    } catch {
      console.error('Failed to load snapshots')
    }
  }, [currentFloor])

  const refetchRecords = useCallback(async () => {
    const res = await fetch('/api/stock')
    if (res.ok) setRecords(await res.json())
  }, [setRecords])

  useEffect(() => {
    loadSnapshots()
  }, [loadSnapshots])

  async function saveSnapshot() {
    if (floorRecords.length === 0) {
      toast.warning('Нет данных для сохранения')
      return
    }
    setSaving(true)
    try {
      const now = new Date()
      const name = `Этаж ${currentFloor} · ${format(now, 'dd.MM.yyyy HH:mm', { locale: ru })}`
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, floor: currentFloor, records: floorRecords }),
      })
      if (!res.ok) throw new Error()
      toast.success('Снимок сохранён')
      await loadSnapshots()
    } catch {
      toast.error('Ошибка сохранения снимка')
    } finally {
      setSaving(false)
    }
  }

  async function restoreSnapshot(id: string) {
    if (!window.confirm('Восстановить этот снимок? Текущие данные этого этажа будут заменены.')) return
    try {
      const res = await fetch(`/api/snapshots/${id}`)
      if (!res.ok) throw new Error()
      const snapshot = await res.json()

      // Clear current floor data
      await fetch(`/api/stock?floor=${currentFloor}`, { method: 'DELETE' })
      // Import snapshot records
      for (const record of snapshot.records) {
        await fetch('/api/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateISO: record.dateISO, quantity: record.quantity, floor: currentFloor }),
        })
      }
      await refetchRecords()
      toast.success('Снимок восстановлен')
    } catch {
      toast.error('Ошибка восстановления снимка')
    }
  }

  async function deleteSnapshot(id: string) {
    if (!window.confirm('Удалить этот снимок?')) return
    try {
      const res = await fetch(`/api/snapshots/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Снимок удалён')
      await loadSnapshots()
    } catch {
      toast.error('Ошибка удаления снимка')
    }
  }

  async function clearAll() {
    if (!window.confirm('Удалить все снимки этого этажа?')) return
    try {
      await Promise.all(snapshots.map((s) => fetch(`/api/snapshots/${s.id}`, { method: 'DELETE' })))
      toast.success('Все снимки удалены')
      await loadSnapshots()
    } catch {
      toast.error('Ошибка очистки снимков')
    }
  }

  return (
    <Card className="glass-strong rounded-2xl shadow-lg shadow-black/5 overflow-hidden sticky top-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-5 w-5" />
          История снимков
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={saveSnapshot}
          disabled={saving || floorRecords.length === 0}
          className="w-full"
        >
          <Camera className="h-4 w-4 mr-1.5" />
          Сохранить снимок
        </Button>

        <ScrollArea className="max-h-96">
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Нет снимков</p>
          ) : (
            <div className="space-y-2 pr-2">
              {snapshots.map((snapshot) => {
                const createdDate = format(new Date(snapshot.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })
                const sortedRecs = [...snapshot.records].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
                const lastDate = sortedRecs[sortedRecs.length - 1]?.displayDate ?? '—'

                return (
                  <div key={snapshot.id} className="rounded-lg p-3 bg-muted/50 space-y-1.5">
                    <p className="text-sm font-medium truncate">{snapshot.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Создан: {createdDate}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Последние данные: {lastDate}
                    </p>
                    <div className="flex gap-1 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => restoreSnapshot(snapshot.id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Восстановить
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => deleteSnapshot(snapshot.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Удалить
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {snapshots.length > 0 && (
          <Button variant="destructive" size="sm" className="w-full mt-2" onClick={clearAll}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Очистить всё
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
