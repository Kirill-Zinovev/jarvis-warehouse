'use client'

import { useCallback, useRef, useMemo } from 'react'
import { Download, Upload, Trash2, Database, FileSpreadsheet, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWarehouseStore } from '@/store/warehouse-store'
import { toast } from 'sonner'

export function ActionBar() {
  const setRecords = useWarehouseStore((s) => s.setRecords)
  const currentFloor = useWarehouseStore((s) => s.currentFloor)
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)

  const refetch = useCallback(async () => {
    const res = await fetch('/api/stock')
    if (res.ok) setRecords(await res.json())
  }, [setRecords])

  const floorRecords = useMemo(
    () => [...useWarehouseStore.getState().records].filter((r) => r.floor === currentFloor),
    [currentFloor]
  )

  // ---------- SHARE (persistent link) ----------
  async function shareLink() {
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Этаж ${currentFloor}` }),
      })
      if (!res.ok) throw new Error()

      const { code, updated } = await res.json()
      const base = window.location.origin + window.location.pathname
      const url = `${base}?s=${code}`

      await navigator.clipboard.writeText(url)

      if (updated) {
        toast.success('Ссылка обновлена! Получатели увидят свежие данные при открытии.', { duration: 5000 })
      } else {
        toast.success('Ссылка создана! Отправьте её коллеге — она всегда будет актуальной.', { duration: 5000 })
      }
    } catch {
      toast.error('Не удалось создать ссылку')
    }
  }

  // ---------- EXPORTS ----------
  async function exportJSON() {
    try {
      const records = floorRecords.sort((a, b) => a.dateISO.localeCompare(b.dateISO))
      const exportData = records.map(({ dateISO, quantity }) => ({ dateISO, quantity }))
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock-floor${currentFloor}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('JSON экспортирован')
    } catch {
      toast.error('Ошибка экспорта')
    }
  }

  async function exportCSV() {
    try {
      const records = floorRecords.sort((a, b) => a.dateISO.localeCompare(b.dateISO))
      const header = '\uFEFFДата,Остаток\n'
      const rows = records.map((r) => `${r.displayDate},${r.quantity}`).join('\n')
      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock-floor${currentFloor}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV экспортирован')
    } catch {
      toast.error('Ошибка экспорта')
    }
  }

  // ---------- IMPORTS ----------
  async function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const items = Array.isArray(data) ? data : [data]

      const records = items
        .map((item: Record<string, unknown>) => ({
          dateISO: String(item.dateISO ?? ''),
          quantity: Number(item.quantity),
          floor: currentFloor,
        }))
        .filter((r: { dateISO: string; quantity: number }) => r.dateISO && !isNaN(r.quantity))

      if (records.length === 0) {
        toast.error('Нет корректных записей в файле')
        return
      }

      const res = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records, replaceFloor: false }),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      toast.success(`Импортировано ${result.imported} записей`)
      await refetch()
    } catch {
      toast.error('Ошибка импорта. Проверьте формат файла.')
    }
    if (jsonInputRef.current) jsonInputRef.current.value = ''
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      const records: { dateISO: string; quantity: number; floor: string }[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const dateVal = String(row[0] ?? '').trim()
        const qtyVal = Number(row[1])
        if (!dateVal || isNaN(qtyVal)) continue

        let dateISO = ''
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateVal)) {
          const [d, m, y] = dateVal.split('.')
          dateISO = `${y}-${m}-${d}`
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
          dateISO = dateVal
        } else {
          const parsed = new Date(dateVal)
          if (!isNaN(parsed.getTime())) dateISO = parsed.toISOString().slice(0, 10)
        }
        if (!dateISO) continue
        records.push({ dateISO, quantity: Math.floor(qtyVal), floor: currentFloor })
      }

      if (records.length === 0) {
        toast.error('Нет корректных данных в файле')
        return
      }

      const res = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records, replaceFloor: false }),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      toast.success(`Импортировано ${result.imported} записей из Excel`)
      await refetch()
    } catch (err) {
      console.error('Excel import error:', err)
      toast.error('Ошибка импорта Excel.')
    }
    if (excelInputRef.current) excelInputRef.current.value = ''
  }

  async function loadDemoData() {
    try {
      const today = new Date()
      const items: { dateISO: string; quantity: number; floor: string }[] = []
      let qty = 1200
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const iso = d.toISOString().slice(0, 10)
        const change = Math.round((Math.random() - 0.55) * 120)
        qty = Math.max(0, qty + change)
        items.push({ dateISO: iso, quantity: qty, floor: currentFloor })
      }

      const res = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: items, replaceFloor: false }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Демо-данные загружены для этажа ${currentFloor}`)
      await refetch()
    } catch {
      toast.error('Ошибка загрузки демо-данных')
    }
  }

  async function resetData() {
    if (!window.confirm(`Сбросить все данные этажа ${currentFloor}?`)) return
    try {
      const res = await fetch(`/api/stock?floor=${currentFloor}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await refetch()
      toast.success(`Данные этажа ${currentFloor} сброшены`)
    } catch {
      toast.error('Ошибка сброса данных')
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={shareLink}
        className="bg-primary/5 border-primary/30 hover:bg-primary/10"
      >
        <Share2 className="h-4 w-4 mr-1.5" />
        Поделиться
      </Button>
      <Button variant="outline" size="sm" onClick={exportJSON}>
        <Download className="h-4 w-4 mr-1.5" />
        JSON
      </Button>
      <Button variant="outline" size="sm" onClick={exportCSV}>
        <Download className="h-4 w-4 mr-1.5" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => jsonInputRef.current?.click()}>
        <Upload className="h-4 w-4 mr-1.5" />
        Импорт JSON
      </Button>
      <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={importJSON} />
      <Button variant="outline" size="sm" onClick={() => excelInputRef.current?.click()}>
        <FileSpreadsheet className="h-4 w-4 mr-1.5" />
        Импорт Excel
      </Button>
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
      <Button variant="outline" size="sm" onClick={loadDemoData}>
        <Database className="h-4 w-4 mr-1.5" />
        Демо
      </Button>
      <Button variant="outline" size="sm" onClick={resetData}>
        <Trash2 className="h-4 w-4 mr-1.5" />
        Сброс
      </Button>
    </div>
  )
}
