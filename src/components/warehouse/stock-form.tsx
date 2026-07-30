'use client'

import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWarehouseStore } from '@/store/warehouse-store'
import { getTodayISO } from '@/lib/analytics'
import { toast } from 'sonner'

export function StockForm() {
  const [dateISO, setDateISO] = useState(getTodayISO())
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const records = useWarehouseStore((s) => s.records)
  const currentFloor = useWarehouseStore((s) => s.currentFloor)
  const setRecords = useWarehouseStore((s) => s.setRecords)

  const refetch = useCallback(async () => {
    const res = await fetch('/api/stock')
    if (res.ok) setRecords(await res.json())
  }, [setRecords])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseInt(quantity, 10)
    if (!dateISO || isNaN(qty)) {
      toast.error('Заполните дату и количество')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateISO, quantity: qty, floor: currentFloor }),
      })
      if (!res.ok) throw new Error()
      toast.success('Запись добавлена')
      setQuantity('')
      await refetch()
    } catch {
      toast.error('Ошибка при добавлении записи')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleQuickAction(delta: number) {
    const floorRecords = records
      .filter((r) => r.floor === currentFloor)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))

    if (floorRecords.length === 0) {
      toast.warning('Нет записей для изменения')
      return
    }
    const last = floorRecords[floorRecords.length - 1]
    const newQty = Math.max(0, last.quantity + delta)
    try {
      const res = await fetch(`/api/stock/${last.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Изменено: ${last.quantity} → ${newQty}`)
      await refetch()
    } catch {
      toast.error('Ошибка при изменении записи')
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date-input" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Дата
          </Label>
          <Input
            id="date-input"
            type="date"
            value={dateISO}
            onChange={(e) => setDateISO(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qty-input" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Остаток (шт)
          </Label>
          <Input
            id="qty-input"
            type="number"
            min="0"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-36"
          />
        </div>
        <Button type="submit" disabled={submitting}>
          <Plus className="h-4 w-4 mr-1.5" />
          Добавить
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => handleQuickAction(-500)}>
          −500
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickAction(-100)}>
          −100
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickAction(100)}>
          +100
        </Button>
      </div>
    </div>
  )
}
