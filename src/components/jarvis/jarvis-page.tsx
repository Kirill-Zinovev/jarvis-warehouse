'use client'

import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  FileSpreadsheet,
  Zap,
  RotateCcw,
  Download,
  PackageSearch,
  Box,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  Eye,
  FileText,
  Trash2,
  ArrowRight,
  Cpu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useJarvisStore } from '@/store/jarvis-store'
import { getMatchSummary } from '@/lib/jarvis-engine'
import { toast } from 'sonner'
import type { RawRow, ColumnMap } from '@/types/jarvis'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read an Excel/CSV file and return raw rows + column names */
async function readFile(file: File): Promise<{ rows: RawRow[]; columns: string[] }> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (rows.length === 0) return { rows: [], columns: [] }
  const columns = Object.keys(rows[0])
  return { rows: rows as RawRow[], columns }
}

/** Try to auto-detect column by common Russian/English names */
function autoDetectColumn(columns: string[], candidates: string[]): string {
  for (const c of candidates) {
    const found = columns.find(
      (col) =>
        col.toLowerCase().replace(/[_\s-]/g, '') ===
        c.toLowerCase().replace(/[_\s-]/g, '')
    )
    if (found) return found
  }
  // Fuzzy: contains
  for (const c of candidates) {
    const found = columns.find((col) =>
      col.toLowerCase().includes(c.toLowerCase())
    )
    if (found) return found
  }
  return columns[0] || ''
}

const ARTICLE_NAMES = ['артикул', 'article', 'арт', 'код', 'sku', 'номенклатура', 'item']
const QUANTITY_NAMES = ['количество', 'quantity', 'qty', 'кол-во', 'кол', 'шт', 'ост']
const BOX_NAMES = ['короб', 'box', 'ящик', 'место', 'местонахождение', 'location', 'коробка', 'полка', 'rack']

function autoShipmentMap(columns: string[]): ColumnMap {
  return {
    article: autoDetectColumn(columns, ARTICLE_NAMES),
    quantity: autoDetectColumn(columns, QUANTITY_NAMES),
  }
}

function autoWarehouseMap(columns: string[]): ColumnMap {
  return {
    article: autoDetectColumn(columns, ARTICLE_NAMES),
    box: autoDetectColumn(columns, BOX_NAMES),
    quantity: autoDetectColumn(columns, QUANTITY_NAMES),
  }
}

// ─── File Upload Zone ─────────────────────────────────────────────────────────

function FileUploadZone({
  title,
  description,
  file,
  onFileLoad,
  icon: Icon,
  accentColor = 'primary',
}: {
  title: string
  description: string
  file: { name: string; rows: RawRow[] } | null
  onFileLoad: (name: string, rows: RawRow[], columns: string[]) => void
  icon: React.ElementType
  accentColor?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(
    async (f: File) => {
      try {
        const { rows, columns } = await readFile(f)
        if (rows.length === 0) {
          toast.error('Файл пуст или не содержит данных')
          return
        }
        onFileLoad(f.name, rows, columns)
        toast.success(`Загружено: ${f.name} (${rows.length} строк)`)
      } catch {
        toast.error('Ошибка чтения файла. Убедитесь, что это Excel или CSV.')
      }
    },
    [onFileLoad]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile]
  )

  return (
    <Card
      className={cn(
        'relative transition-all duration-200 border-2 border-dashed',
        dragOver
          ? 'border-primary bg-primary/5 scale-[1.01]'
          : file
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[180px]">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
        {file ? (
          <>
            <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{file.rows.length} строк данных</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => inputRef.current?.click()}
            >
              Заменить файл
            </Button>
          </>
        ) : (
          <>
            <div className="h-12 w-12 rounded-xl bg-muted/80 flex items-center justify-center">
              <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1.5" />
              Выбрать файл
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Column Mapper ────────────────────────────────────────────────────────────

function ColumnMapper({
  file,
  mapping,
  setMapping,
  type, // 'shipment' | 'warehouse'
}: {
  file: { columns: string[] } | null
  mapping: ColumnMap | null
  setMapping: (map: ColumnMap) => void
  type: 'shipment' | 'warehouse'
}) {
  if (!file) return null

  const handleAutoMap = () => {
    const map = type === 'shipment' ? autoShipmentMap(file.columns) : autoWarehouseMap(file.columns)
    setMapping(map)
    toast.success('Колонки определены автоматически')
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Настройка колонок</p>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleAutoMap}>
          <Zap className="h-3.5 w-3.5 mr-1" />
          Автоопределение
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Артикул</label>
          <Select
            value={mapping?.article || ''}
            onValueChange={(v) =>
              setMapping({ ...((mapping || { quantity: file.columns[1] || '' }) as ColumnMap), article: v })
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Выберите колонку" />
            </SelectTrigger>
            <SelectContent>
              {file.columns.map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type === 'warehouse' && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Короб</label>
            <Select
              value={mapping?.box || ''}
              onValueChange={(v) =>
                setMapping({ ...((mapping || { article: file.columns[0] || '', quantity: file.columns[2] || '' }) as ColumnMap), box: v })
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Выберите колонку" />
              </SelectTrigger>
              <SelectContent>
                {file.columns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Количество</label>
          <Select
            value={mapping?.quantity || ''}
            onValueChange={(v) =>
              setMapping({ ...((mapping || { article: file.columns[0] || '' }) as ColumnMap), quantity: v })
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Выберите колонку" />
            </SelectTrigger>
            <SelectContent>
              {file.columns.map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Data Preview Table ───────────────────────────────────────────────────────

function DataPreview({
  rows,
  columns,
  maxRows = 5,
}: {
  rows: RawRow[]
  columns: string[]
  maxRows?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = expanded ? rows.slice(0, 20) : rows.slice(0, maxRows)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Предпросмотр ({rows.length} строк{rows.length > 20 ? ', показано 20' : ''})
        </p>
        {rows.length > maxRows && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                Свернуть <ChevronDown className="h-3 w-3 ml-1 rotate-180" />
              </>
            ) : (
              <>
                Ещё <ChevronDown className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                {columns.slice(0, 6).map((col) => (
                  <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  {columns.slice(0, 6).map((col) => (
                    <td key={col} className="px-3 py-1.5 whitespace-nowrap">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, shortage }: { status: MatchResult['status']; shortage: number }) {
  if (status === 'not_found') {
    return (
      <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 gap-1">
        <HelpCircle className="h-3 w-3" />
        Не найден
      </Badge>
    )
  }
  if (status === 'shortage') {
    return (
      <Badge variant="outline" className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Не хватает {shortage} шт
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Хватает
    </Badge>
  )
}

// ─── Results Table ────────────────────────────────────────────────────────────

function ResultsTable({ results }: { results: MatchResult[] }) {
  const [filter, setFilter] = useState<'all' | 'enough' | 'shortage' | 'not_found'>('all')

  const filtered =
    filter === 'all' ? results : results.filter((r) => r.status === filter)

  // Group by article for visual separation
  const grouped = new Map<string, MatchResult[]>()
  for (const r of filtered) {
    const existing = grouped.get(r.article) || []
    existing.push(r)
    grouped.set(r.article, existing)
  }

  const summary = getMatchSummary(results)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-2xl font-bold text-foreground">{summary.totalArticles}</p>
          <p className="text-xs text-muted-foreground mt-1">Всего артикулов</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.foundArticles}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Найдено на складе</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {summary.notFoundArticles}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Не найдено</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.shortageArticles}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Не хватает</p>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Фильтр:</span>
        {(
          [
            { key: 'all', label: 'Все', count: results.length },
            { key: 'enough', label: 'Хватает', count: results.filter((r) => r.status === 'enough').length },
            { key: 'shortage', label: 'Не хватает', count: results.filter((r) => r.status === 'shortage').length },
            { key: 'not_found', label: 'Не найдены', count: results.filter((r) => r.status === 'not_found').length },
          ] as const
        ).map(({ key, label, count }) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter(key)}
          >
            {label} ({count})
          </Button>
        ))}
      </div>

      {/* Results table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Артикул</th>
                <th className="px-4 py-3 text-left font-semibold">Нужно</th>
                <th className="px-4 py-3 text-left font-semibold">Короб</th>
                <th className="px-4 py-3 text-left font-semibold">В наличии</th>
                <th className="px-4 py-3 text-left font-semibold">Статус</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([article, rows], groupIdx) =>
                rows.map((row, rowIdx) => (
                  <tr
                    key={`${article}-${rowIdx}`}
                    className={cn(
                      'border-t transition-colors hover:bg-muted/30',
                      row.status === 'not_found' && 'bg-amber-50/50 dark:bg-amber-950/10',
                      row.status === 'shortage' && 'bg-red-50/50 dark:bg-red-950/10'
                    )}
                  >
                    {rowIdx === 0 ? (
                      <td
                        className={cn(
                          'px-4 py-2.5 font-medium',
                          groupIdx > 0 && 'border-t-2 border-border'
                        )}
                        rowSpan={rows.length}
                      >
                        {article}
                      </td>
                    ) : null}
                    {rowIdx === 0 ? (
                      <td className="px-4 py-2.5" rowSpan={rows.length}>
                        <span className="font-semibold">{row.needed}</span> шт
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5">
                      {row.status === 'not_found' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Box className="h-3.5 w-3.5 text-muted-foreground" />
                          {row.box}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'not_found' ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <span
                          className={cn(
                            'font-semibold',
                            row.available >= row.needed
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-foreground'
                          )}
                        >
                          {row.available}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {rowIdx === 0 ? (
                        <StatusBadge status={row.status} shortage={row.shortage} />
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Нет результатов для выбранного фильтра</p>
        </div>
      )}
    </div>
  )
}

// ─── Export Functions ─────────────────────────────────────────────────────────

async function exportResultsExcel(results: MatchResult[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([])

  // Group results by article for merging
  const groups: MatchResult[][] = []
  const seen = new Map<string, number>()
  for (const r of results) {
    const key = r.article
    if (seen.has(key)) {
      groups[seen.get(key)!].push(r)
    } else {
      seen.set(key, groups.length)
      groups.push([r])
    }
  }

  const headers = ['Артикул', 'Нужно (шт)', 'Короб', 'В наличии (шт)', 'Статус']
  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' })

  let currentRow = 1 // 0-based row index, first data row after header (row 0)
  const merges: XLSX.Range[] = []

  for (const group of groups) {
    const startRow = currentRow
    for (let i = 0; i < group.length; i++) {
      const r = group[i]
      const statusText =
        r.status === 'enough'
          ? 'Хватает'
          : r.status === 'shortage'
            ? `Не хватает ${r.shortage} шт`
            : 'Не найден'
      const row = [
        i === 0 ? r.article : '',         // article — only first row
        i === 0 ? r.needed : '',           // needed — only first row
        r.status === 'not_found' ? '—' : r.box,
        r.status === 'not_found' ? 0 : r.available,
        i === 0 ? statusText : '',         // status — only first row (merged)
      ]
      XLSX.utils.sheet_add_aoa(ws, [row], { origin: `A${currentRow + 1}` })
      currentRow++
    }

    // Merge columns A (article), B (needed), E (status) when group has multiple rows
    if (group.length > 1) {
      const endRow = currentRow - 1 // last data row (0-based)
      merges.push({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 0 } }) // Article
      merges.push({ s: { r: startRow, c: 1 }, e: { r: endRow, c: 1 } }) // Needed
      merges.push({ s: { r: startRow, c: 4 }, e: { r: endRow, c: 4 } }) // Status
    }
  }

  ws['!merges'] = merges

  // Auto-fit columns
  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(
      h.length + 2,
      ...results.map((r) => {
        switch (h) {
          case 'Артикул': return String(r.article).length + 2
          case 'Нужно (шт)': return String(r.needed).length + 4
          case 'Короб': return String(r.box).length + 2
          case 'В наличии (шт)': return String(r.available).length + 4
          default: return 14
        }
      })
    ),
  }))

  XLSX.utils.book_append_sheet(wb, ws, 'Результат Джарвис')
  XLSX.writeFile(wb, `jarvis-result-${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Результат экспортирован в Excel')
}

async function exportResultsCSV(results: MatchResult[]) {
  const header = '\uFEFFАртикул,Нужно,Короб,В наличии,Статус\n'
  const rows = results
    .map(
      (r) =>
        `${r.article},${r.needed},${r.box},${r.available},${
          r.status === 'enough'
            ? 'Хватает'
            : r.status === 'shortage'
              ? `Не хватает ${r.shortage} шт`
              : 'Не найден'
        }`
    )
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `jarvis-result-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Результат экспортирован в CSV')
}

// ─── Main Jarvis Page ────────────────────────────────────────────────────────

export function JarvisPage() {
  const {
    shipmentFile,
    setShipmentFile,
    warehouseFile,
    setWarehouseFile,
    shipmentColumns,
    setShipmentColumns,
    warehouseColumns,
    setWarehouseColumns,
    results,
    hasRun,
    runMatch,
    reset,
  } = useJarvisStore()

  const [showShipmentPreview, setShowShipmentPreview] = useState(false)
  const [showWarehousePreview, setShowWarehousePreview] = useState(false)

  const canRun =
    shipmentFile &&
    warehouseFile &&
    shipmentColumns?.article &&
    shipmentColumns?.quantity &&
    warehouseColumns?.article &&
    warehouseColumns?.box &&
    warehouseColumns?.quantity

  function handleShipmentLoad(name: string, rows: RawRow[], columns: string[]) {
    setShipmentFile({ name, rows, columns, mapped: false })
    setShipmentColumns(autoShipmentMap(columns))
  }

  function handleWarehouseLoad(name: string, rows: RawRow[], columns: string[]) {
    setWarehouseFile({ name, rows, columns, mapped: false })
    setWarehouseColumns(autoWarehouseMap(columns))
  }

  return (
    <div className="jarvis-shell space-y-6">
      {/* Header */}
      <div className="jarvis-hero relative overflow-hidden rounded-[2rem] border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-pink-50 p-6 shadow-[0_24px_80px_-36px_rgba(225,29,72,0.45)] dark:border-rose-900/60 dark:from-rose-950/40 dark:via-card dark:to-pink-950/30 sm:p-8">
        <div className="jarvis-orb jarvis-orb-one" />
        <div className="jarvis-orb jarvis-orb-two" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Джарвис</h2>
            <p className="text-xs text-muted-foreground">
              Подбор коробов по артикулам для отгрузки
            </p>
          </div>
        </div>
        {hasRun && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сбросить
          </Button>
        )}
      </div></div>

      {/* Step 1: Upload files */}
      <AnimatePresence mode="wait">
        {!hasRun ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Upload zones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <FileUploadZone
                  title="План отгрузки ВБ"
                  description="Excel с артикулами и количеством для отгрузки"
                  file={shipmentFile ? { name: shipmentFile.name, rows: shipmentFile.rows } : null}
                  onFileLoad={handleShipmentLoad}
                  icon={FileSpreadsheet}
                />
                {shipmentFile && (
                  <>
                    <ColumnMapper
                      file={shipmentFile}
                      mapping={shipmentColumns}
                      setMapping={setShipmentColumns}
                      type="shipment"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setShowShipmentPreview(!showShipmentPreview)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      {showShipmentPreview ? 'Скрыть' : 'Показать'} данные
                    </Button>
                    {showShipmentPreview && (
                      <DataPreview rows={shipmentFile.rows} columns={shipmentFile.columns} />
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3">
                <FileUploadZone
                  title="Склад (справочник коробов)"
                  description="Excel с артикулами, коробами и количеством на складе"
                  file={warehouseFile ? { name: warehouseFile.name, rows: warehouseFile.rows } : null}
                  onFileLoad={handleWarehouseLoad}
                  icon={Box}
                />
                {warehouseFile && (
                  <>
                    <ColumnMapper
                      file={warehouseFile}
                      mapping={warehouseColumns}
                      setMapping={setWarehouseColumns}
                      type="warehouse"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setShowWarehousePreview(!showWarehousePreview)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      {showWarehousePreview ? 'Скрыть' : 'Показать'} данные
                    </Button>
                    {showWarehousePreview && (
                      <DataPreview rows={warehouseFile.rows} columns={warehouseFile.columns} />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Flow indicator */}
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="font-medium">План отгрузки</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Cpu className="h-4 w-4 text-primary" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Box className="h-4 w-4" />
                <span className="font-medium">Склад</span>
              </div>
            </div>

            {/* Match button */}
            <div className="flex justify-center">
              <Button
                size="lg"
                disabled={!canRun}
                onClick={runMatch}
                className="px-8 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-lg shadow-rose-500/25"
              >
                <Zap className="h-5 w-5 mr-2" />
                Собрать данные
              </Button>
            </div>

            {!canRun && (shipmentFile || warehouseFile) && (
              <p className="text-center text-xs text-muted-foreground">
                Загрузите оба файла и настройте колонки для запуска
              </p>
            )}
          </motion.div>
        ) : (
          /* Results */
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Results header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                Результаты подбора коробов для{' '}
                <span className="font-semibold text-foreground">{results.length} строк</span>
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportResultsExcel(results)}
                  className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportResultsCSV(results)}>
                  <Download className="h-4 w-4 mr-1.5" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Новая сборка
                </Button>
              </div>
            </div>

            <ResultsTable results={results} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help section */}
      {!hasRun && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground text-sm">Как работает Джарвис</p>
                <p>
                  <strong>Шаг 1.</strong> Загрузите план отгрузки ВБ (Excel с колонками: Артикул, Количество).
                </p>
                <p>
                  <strong>Шаг 2.</strong> Загрузите справочник склада (Excel с колонками: Артикул, Короб, Количество).
                </p>
                <p>
                  <strong>Шаг 3.</strong> Джарвис сопоставит артикулы и покажет, в каких коробах лежит товар и
                  достаточно ли его для отгрузки.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
