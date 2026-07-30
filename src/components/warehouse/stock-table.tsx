'use client'

import { useState, useCallback, useMemo } from 'react'
import { Pencil, Trash2, ArrowUpDown, Check, X } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWarehouseStore } from '@/store/warehouse-store'
import { computeAnalytics } from '@/lib/analytics'

export function StockTable() {
  const records = useWarehouseStore((s) => s.records)
  const currentFloor = useWarehouseStore((s) => s.currentFloor)
  const editingId = useWarehouseStore((s) => s.editingId)
  const setEditingId = useWarehouseStore((s) => s.setEditingId)
  const sortColumn = useWarehouseStore((s) => s.sortColumn)
  const sortAscending = useWarehouseStore((s) => s.sortAscending)
  const setSort = useWarehouseStore((s) => s.setSort)
  const criticalThreshold = useWarehouseStore((s) => s.criticalThreshold)
  const setRecords = useWarehouseStore((s) => s.setRecords)

  const [editDate, setEditDate] = useState('')
  const [editQty, setEditQty] = useState('')

  const refetch = useCallback(async () => {
    const res = await fetch('/api/stock')
    if (res.ok) setRecords(await res.json())
  }, [setRecords])

  const floorRecords = useMemo(() => {
    const filtered = records.filter((r) => r.floor === currentFloor)
    return filtered.sort((a, b) => {
      const cmp = sortColumn === 'date'
        ? a.dateISO.localeCompare(b.dateISO)
        : a.quantity - b.quantity
      return sortAscending ? cmp : -cmp
    })
  }, [records, currentFloor, sortColumn, sortAscending])

  const anomalySet = useMemo(() => {
    const sorted = [...floorRecords]
    if (sorted.length < 3) return new Set<string>()
    const analytics = computeAnalytics(sorted)
    return new Set(analytics.anomalies.map((a) => a.dateISO))
  }, [floorRecords])

  function startEdit(record: typeof floorRecords[0]) {
    setEditingId(record.id)
    setEditDate(record.dateISO)
    setEditQty(String(record.quantity))
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    const qty = parseInt(editQty, 10)
    if (!editDate || isNaN(qty)) return
    try {
      const res = await fetch(`/api/stock/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateISO: editDate, quantity: qty }),
      })
      if (!res.ok) throw new Error()
      await refetch()
      setEditingId(null)
    } catch {
      console.error('Failed to update record')
    }
  }

  async function deleteRecord(id: string) {
    if (!window.confirm('Удалить эту запись?')) return
    try {
      const res = await fetch(`/api/stock/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await refetch()
    } catch {
      console.error('Failed to delete record')
    }
  }

  if (floorRecords.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        Нет данных. Добавьте первую запись.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer select-none hover:text-primary transition-colors"
              onClick={() => setSort('date')}
            >
              <span className="flex items-center gap-1">
                Дата
                <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                {sortColumn === 'date' && (
                  <span className="text-[10px]">{sortAscending ? '↑' : '↓'}</span>
                )}
              </span>
            </TableHead>
            <TableHead
              className="cursor-pointer select-none hover:text-primary transition-colors text-right"
              onClick={() => setSort('quantity')}
            >
              <span className="flex items-center justify-end gap-1">
                Остаток
                <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                {sortColumn === 'quantity' && (
                  <span className="text-[10px]">{sortAscending ? '↑' : '↓'}</span>
                )}
              </span>
            </TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {floorRecords.map((record) => {
            const isEditing = editingId === record.id
            const isBelowThreshold = record.quantity < criticalThreshold
            const isAnomaly = anomalySet.has(record.dateISO)

            let rowClass = ''
            if (isBelowThreshold) rowClass = 'bg-red-50 dark:bg-red-950/30'
            else if (isAnomaly) rowClass = 'bg-amber-50 dark:bg-amber-950/30'

            return (
              <TableRow key={record.id} className={rowClass}>
                {isEditing ? (
                  <>
                    <TableCell>
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-36 h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="w-28 h-8 text-sm ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => saveEdit(record.id)}>
                          <Check className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">{record.displayDate}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {record.quantity.toLocaleString('ru-RU')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(record)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteRecord(record.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
