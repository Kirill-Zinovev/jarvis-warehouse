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
import type { RawRow, ColumnMap, MatchResult } from '@/types/jarvis'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type GridRow = unknown[]

const ARTICLE_NAMES = [
  'артикул',
  'article',
  'арт',
  'код',
  'sku',
  'номенклатура',
  'товар',
  'item',
]
const QUANTITY_NAMES = [
  'количество конечный остаток',
  'количество',
  'quantity',
  'qty',
  'кол-во',
  'кол во',
  'остаток конечный',
  'остаток',
  'остатки',
  'наличие',
  'доступно',
  'кол',
  'шт',
  'ост',
]
const BOX_NAMES = [
  'короб',
  'box',
  'ящик',
  'ячейка',
  'место хранения',
  'местонахождение',
  'адрес хранения',
  'location',
  'коробка',
  'полка',
  'rack',
]
const SECTION_NAMES = [
  'этаж/бокс',
  'этаж',
  'бокс',
  'floor',
  'section',
  'zone',
  'участок',
  'склад',
  'помещение',
  'зона',
]

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s\u200B-\u200D\uFEFF_\-]/g, '')
    .toLowerCase()
}

function textValue(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim()
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const prepared = textValue(value)
    .replace(/[\s\u00A0]/g, '')
    .replace(',', '.')
  if (!prepared) return null
  const result = Number(prepared)
  return Number.isFinite(result) ? result : null
}

/** Try to auto-detect column by common Russian/English names. */
function autoDetectColumn(columns: string[], candidates: string[]): string {
  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate)
    const found = columns.find((column) => normalizeHeader(column) === wanted)
    if (found) return found
  }
  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate)
    const found = columns.find((column) => normalizeHeader(column).includes(wanted))
    if (found) return found
  }
  return ''
}

function findCell(grid: GridRow[], candidates: string[], maxRows = 12): { row: number; column: number } | null {
  for (let row = 0; row < Math.min(grid.length, maxRows); row += 1) {
    for (let column = 0; column < grid[row].length; column += 1) {
      const value = normalizeHeader(grid[row][column])
      if (candidates.some((candidate) => value === normalizeHeader(candidate))) {
        return { row, column }
      }
    }
  }
  return null
}

/**
 * Parse the hierarchical report produced by 1C. It has service rows first,
 * then a warehouse subtotal row, and item rows with article/box/quantity in
 * columns A/D/E. The current warehouse section is inherited by each item.
 */
function parseOneCWarehouseReport(grid: GridRow[]): { rows: RawRow[]; columns: string[] } | null {
  const articleHeader = findCell(grid, ['номенклатура'])
  const boxHeader = findCell(grid, ['ячейка', 'короб'])
  const quantityHeader = findCell(grid, ['остаток', 'количество'])
  if (!articleHeader || !boxHeader || !quantityHeader) return null

  const startRow = Math.max(articleHeader.row, boxHeader.row, quantityHeader.row) + 1
  const hasWarehouseMarker = grid
    .slice(0, startRow)
    .some((row) => normalizeHeader(row[0]) === 'склад')
  if (!hasWarehouseMarker) return null

  const rows: RawRow[] = []
  let section = '—'

  for (let rowIndex = startRow; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex]
    const article = textValue(row[articleHeader.column])
    const box = textValue(row[boxHeader.column])
    const quantity = numericValue(row[quantityHeader.column])
    const compactArticle = normalizeHeader(article)

    if (compactArticle === 'итого') break

    if (article && !box && quantity !== null) {
      const compactSection = normalizeHeader(article)
      const floorMatch = compactSection.match(/(\d+)этаж/)
      if (compactSection.includes('бокс') || compactSection.includes('box')) {
        section = 'БОКС'
      } else if (floorMatch) {
        section = `${floorMatch[1]} этаж`
      } else {
        section = article
      }
      continue
    }

    if (article && box && quantity !== null && quantity > 0) {
      rows.push({ Артикул: article, Короб: box, Участок: section, Количество: quantity })
    }
  }

  return rows.length > 0
    ? { rows, columns: ['Артикул', 'Короб', 'Участок', 'Количество'] }
    : null
}

function headerRowScore(row: GridRow): number {
  const values = row.map((value) => textValue(value)).filter(Boolean)
  const hasArticle = values.some((value) => autoDetectColumn([value], ARTICLE_NAMES) !== '')
  const hasQuantity = values.some((value) => autoDetectColumn([value], QUANTITY_NAMES) !== '')
  const hasStorage = values.some(
    (value) =>
      autoDetectColumn([value], BOX_NAMES) !== '' ||
      autoDetectColumn([value], SECTION_NAMES) !== ''
  )
  return (hasArticle ? 4 : 0) + (hasQuantity ? 4 : 0) + (hasStorage ? 2 : 0)
}

function findGenericHeaderRow(grid: GridRow[]): number {
  let bestRow = -1
  let bestScore = 0
  for (let row = 0; row < Math.min(grid.length, 30); row += 1) {
    const score = headerRowScore(grid[row])
    if (score > bestScore) {
      bestRow = row
      bestScore = score
    }
  }
  return bestRow
}

/** Read Excel/CSV files, including title rows and hierarchical 1C exports. */
async function readFile(file: File): Promise<{ rows: RawRow[]; columns: string[] }> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  let fallback: { rows: RawRow[]; columns: string[] } = { rows: [], columns: [] }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false,
    })
    if (grid.length === 0) continue

    const oneC = parseOneCWarehouseReport(grid)
    if (oneC) return oneC

    const headerRow = findGenericHeaderRow(grid)
    const rows = XLSX.utils.sheet_to_json<RawRow>(
      sheet,
      headerRow >= 0 ? { range: headerRow, defval: '' } : { defval: '' }
    )
    if (rows.length === 0) continue
    const parsed = { rows, columns: Object.keys(rows[0]) }
    if (headerRow >= 0) return parsed
    if (fallback.rows.length === 0) fallback = parsed
  }

  return fallback
}

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
    section: columns.find((column) => SECTION_NAMES.some((candidate) => column.toLowerCase().includes(candidate.toLowerCase()))) || '',
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
      <div className={cn('grid grid-cols-2 gap-3', type === 'warehouse' ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
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
        {type === 'warehouse' && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Участок</label>
            <Select
              value={mapping?.section || ''}
              onValueChange={(v) =>
                setMapping({ ...((mapping || { article: file.columns[0] || '', box: file.columns[1] || '', quantity: file.columns[2] || '' }) as ColumnMap), section: v })
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

  // Status belongs to an article, while an article can span several boxes.
  // Keep every box visible when a status filter is selected.
  const articleStatus = new Map<string, MatchResult['status']>()
  for (const result of results) {
    if (!articleStatus.has(result.article)) articleStatus.set(result.article, result.status)
  }

  const filtered =
    filter === 'all' ? results : results.filter((r) => articleStatus.get(r.article) === filter)

  // Group by article for visual separation
  const grouped = new Map<string, MatchResult[]>()
  for (const r of filtered) {
    const existing = grouped.get(r.article) || []
    existing.push(r)
    grouped.set(r.article, existing)
  }

  const summary = getMatchSummary(results)

  return (
    <div className="jarvis-print-results space-y-4">
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
      <div className="jarvis-print-table rounded-xl border overflow-hidden">
        <div className="jarvis-print-scroll overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="jarvis-print-table-element w-full text-sm">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Артикул</th>
                <th className="px-4 py-3 text-left font-semibold">Нужно</th>
                <th className="px-4 py-3 text-left font-semibold">Участок</th>
                <th className="px-4 py-3 text-left font-semibold">Короб</th>
                <th className="px-4 py-3 text-left font-semibold">В наличии</th>
                <th className="px-4 py-3 text-left font-semibold">Взять</th>
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
                      groupIdx % 2 === 0 && 'bg-muted/20',
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
                      {row.section === '—' ? <span className="text-muted-foreground">—</span> : row.section}
                    </td>
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
                      <span
                        className={cn(
                          'font-semibold',
                          row.allocated > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {row.allocated}
                      </span>
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

type ArticleSummary = {
  status: MatchResult['status']
  shortage: number
}

function buildArticleSummaries(results: MatchResult[]) {
  const summaries = new Map<string, ArticleSummary>()
  const severity: Record<MatchResult['status'], number> = {
    enough: 0,
    shortage: 1,
    not_found: 2,
  }

  for (const result of results) {
    const current = summaries.get(result.article)
    if (!current || severity[result.status] > severity[current.status]) {
      summaries.set(result.article, { status: result.status, shortage: result.shortage })
    } else if (result.status === 'shortage') {
      current.shortage = Math.max(current.shortage, result.shortage)
    }
  }

  return summaries
}

function normalizeSectionKey(value: string) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .toUpperCase()
}

function displaySection(value: string, status: MatchResult['status']) {
  if (status === 'not_found' || !value || value === '—') return '—'
  const compact = normalizeSectionKey(value)
  const floorMatch = compact.match(/^(\d+)ЭТАЖ$/)
  if (floorMatch) return `${floorMatch[1]} этаж`
  return value
}

function displayBox(value: string, status: MatchResult['status']) {
  return status === 'not_found' || !value ? '—' : value
}

function statusLabel(summary: ArticleSummary) {
  if (summary.status === 'enough') return 'Хватает'
  if (summary.status === 'shortage') return `Не хватает ${summary.shortage} шт`
  return 'Не найден'
}

async function exportResultsExcel(results: MatchResult[]) {
  const XLSX = await import('xlsx-js-style')
  const wb = XLSX.utils.book_new()
  const summaries = buildArticleSummaries(results)
  const resultHeaders = [
    'Артикул',
    'Нужно, шт.',
    'Участок',
    'Короб',
    'В наличии, шт.',
    'Взять, шт.',
    'Статус',
    'Фактически взято',
    'Комментарий',
  ]
  const issueHeaders = [
    'Артикул',
    'Нужно, шт.',
    'Участок',
    'Короб',
    'В наличии, шт.',
    'Взять, шт.',
    'Статус',
    'Недостает, шт.',
    'Причина',
    'Фактически взято',
    'Комментарий',
  ]

  const makeResultRows = (rows: MatchResult[]) =>
    rows.map((result) => {
      const summary = summaries.get(result.article) || {
        status: result.status,
        shortage: result.shortage,
      }
      return [
        result.article,
        result.needed,
        displaySection(result.section, result.status),
        displayBox(result.box, result.status),
        result.status === 'not_found' ? 0 : result.available,
        result.status === 'not_found' ? 0 : result.allocated,
        statusLabel(summary),
        '',
        '',
      ]
    })

  const sectionName = (result: MatchResult) => {
    const key = normalizeSectionKey(result.section)
    if (key === '2ЭТАЖ') return '2 этаж'
    if (key === 'БОКС') return 'БОКС'
    return 'Другие'
  }

  const issueRows = results
    .filter((result) => {
      return result.status !== 'enough' || result.section === '—' || result.box === '—'
    })
    .map((result) => {
      const summary = summaries.get(result.article) || {
        status: result.status,
        shortage: result.shortage,
      }
      const reason =
        result.status === 'not_found'
          ? 'Артикул не найден в остатках'
          : result.status === 'shortage'
            ? `Недостаточно остатка: не хватает ${result.shortage} шт`
            : 'Не указан участок или короб'
      return [
        result.article,
        result.needed,
        displaySection(result.section, result.status),
        displayBox(result.box, result.status),
        result.status === 'not_found' ? 0 : result.available,
        result.status === 'not_found' ? 0 : result.allocated,
        statusLabel(summary),
        result.shortage,
        reason,
        '',
        '',
      ]
    })

  const writeSheet = (
    name: string,
    headers: string[],
    rows: (string | number)[][],
    options: { issueSheet?: boolean } = {}
  ) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const lastRow = Math.max(1, rows.length + 1)
    const lastColumn = headers.length - 1
    ws['!autofilter'] = {
      ref: `A1:${XLSX.utils.encode_col(lastColumn)}${lastRow}`,
    }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws['!print_title_rows'] = '1:1'
    ws['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }

    const groupFills = ['FFFFFFFF', 'FFF3F4F6']
    const borderColor = 'FFE2E8F0'
    const groupBorderColor = 'FFCBD5E1'
    const numericColumns = options.issueSheet ? [1, 4, 5, 7] : [1, 4, 5]
    const statusColumn = 6
    const cellStyle = (rowNumber: number, columnNumber: number, style: Record<string, unknown>) => {
      const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnNumber })
      ws[address] = { ...(ws[address] || {}), s: { ...ws[address]?.s, ...style } }
    }

    let groupIndex = -1
    rows.forEach((row, index) => {
      const previousArticle = index > 0 ? rows[index - 1][0] : null
      const isFirst = index === 0 || row[0] !== previousArticle
      const nextArticle = index + 1 < rows.length ? rows[index + 1][0] : null
      const isLast = index === rows.length - 1 || row[0] !== nextArticle
      if (isFirst) groupIndex += 1
      const fill = groupFills[groupIndex % groupFills.length]

      for (let column = 0; column < headers.length; column += 1) {
        cellStyle(index + 2, column, {
          fill: { fgColor: { rgb: fill } },
          font: { name: 'Calibri', sz: 11, color: { rgb: 'FF334155' } },
          alignment: {
            vertical: 'center',
            horizontal: numericColumns.includes(column) ? 'right' : 'left',
            wrapText: column === 6 || column === 7 || column === 8 || column === 10,
          },
          border: {
            top: { style: isFirst ? 'thin' : 'hair', color: { rgb: isFirst ? groupBorderColor : borderColor } },
            bottom: { style: isLast ? 'thin' : 'hair', color: { rgb: isLast ? groupBorderColor : borderColor } },
          },
        })
      }

      cellStyle(index + 2, 0, {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FF111827' } },
      })
      const allocated = Number(row[5]) || 0
      cellStyle(index + 2, 5, {
        font: { name: 'Calibri', sz: 11, bold: allocated > 0, color: { rgb: allocated > 0 ? 'FF15803D' : 'FF94A3B8' } },
        fill: { fgColor: { rgb: allocated > 0 ? 'FFDCFCE7' : fill } },
      })

      const statusText = String(row[statusColumn] || '')
      const statusColor = statusText.startsWith('Хватает')
        ? 'FF15803D'
        : statusText.startsWith('Не хватает')
          ? 'FFB45309'
          : 'FFB91C1C'
      cellStyle(index + 2, statusColumn, {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: statusColor } },
      })

      if (options.issueSheet) {
        cellStyle(index + 2, 7, {
          font: { name: 'Calibri', sz: 11, bold: Number(row[7]) > 0, color: { rgb: 'FFB91C1C' } },
        })
        cellStyle(index + 2, 8, {
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFB45309' } },
        })
      }
    })

    headers.forEach((_, column) => {
      const address = XLSX.utils.encode_cell({ r: 0, c: column })
      ws[address] = {
        ...(ws[address] || {}),
        s: {
          fill: { fgColor: { rgb: 'FF334155' } },
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
          alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
          border: { bottom: { style: 'thin', color: { rgb: 'FFCBD5E1' } } },
        },
      }
    })

    ws['!cols'] = (options.issueSheet
      ? [22, 14, 16, 18, 17, 14, 25, 16, 38, 20, 30]
      : [22, 14, 16, 18, 17, 14, 25, 20, 30]
    ).map((wch) => ({ wch }))
    ws['!rows'] = [{ hpt: 32 }, ...rows.map(() => ({ hpt: 24 }))]
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const takeResults = results.filter((result) => result.allocated > 0)
  const spareResults = results.filter((result) => result.status !== 'not_found' && result.allocated === 0)

  writeSheet('Только взять', resultHeaders, makeResultRows(takeResults))
  writeSheet('Расхождения', issueHeaders, issueRows, { issueSheet: true })
  writeSheet('2 этаж', resultHeaders, makeResultRows(results.filter((result) => sectionName(result) === '2 этаж')))
  writeSheet('БОКС', resultHeaders, makeResultRows(results.filter((result) => sectionName(result) === 'БОКС')))
  writeSheet('Запасные варианты', resultHeaders, makeResultRows(spareResults))
  writeSheet('Все результаты', resultHeaders, makeResultRows(results))

  XLSX.writeFile(wb, `jarvis-result-${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Excel готов: 6 листов с подбором, запасом и расхождениями')
}

async function exportResultsCSV(results: MatchResult[]) {
  const summaries = buildArticleSummaries(results)
  const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const header = [
    'Артикул',
    'Нужно, шт.',
    'Участок',
    'Короб',
    'В наличии, шт.',
    'Взять, шт.',
    'Статус',
    'Фактически взято',
    'Комментарий',
  ].map(csvCell).join(',')
  const rows = results
    .map((result) => {
      const summary = summaries.get(result.article) || { status: result.status, shortage: result.shortage }
      return [
        result.article,
        result.needed,
        displaySection(result.section, result.status),
        displayBox(result.box, result.status),
        result.status === 'not_found' ? 0 : result.available,
        result.status === 'not_found' ? 0 : result.allocated,
        statusLabel(summary),
        '',
        '',
      ].map(csvCell).join(',')
    })
    .join('\n')
  const blob = new Blob([`\uFEFF${header}\n${rows}`], { type: 'text/csv;charset=utf-8' })
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
          <div className="h-10 w-10 overflow-hidden rounded-xl shadow-md shadow-rose-500/25">
            <img src="/jarvis-logo.svg" alt="Jarvis" className="h-full w-full" />
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
      </div></div></div>

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
                  <strong>Шаг 2.</strong> Загрузите справочник склада (Артикул, Короб, Участок, Количество). Участок может быть «2 этаж» или «БОКС».
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
