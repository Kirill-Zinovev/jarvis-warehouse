'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  Camera,
  X,
  ImagePlus,
  FileSpreadsheet,
  Zap,
  RotateCcw,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  Circle,
  ChevronDown,
  PackageSearch,
  Columns3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PhotoAnalysis, InventoryRow, UpdatedRow } from '@/types/cyclops'
import { subtractFromInventory, findUnmatchedPicked, getCyclopsSummary } from '@/lib/cyclops-engine'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const ARTICLE_NAMES = ['артикул', 'article', 'арт', 'код', 'sku', 'номенклатура', 'item']
const QUANTITY_NAMES = ['количество', 'quantity', 'qty', 'кол-во', 'кол', 'шт', 'ост']
const BOX_NAMES = ['короб', 'box', 'ящик', 'место', 'местонахождение', 'location', 'коробка', 'полка']

function autoDetect(columns: string[], candidates: string[]): string {
  for (const c of candidates) {
    const found = columns.find(
      (col) => col.toLowerCase().replace(/[_\s-]/g, '') === c.toLowerCase().replace(/[_\s-]/g, '')
    )
    if (found) return found
  }
  for (const c of candidates) {
    const found = columns.find((col) => col.toLowerCase().includes(c.toLowerCase()))
    if (found) return found
  }
  return columns[0] || ''
}

async function readExcel(file: File): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (rows.length === 0) return { rows: [], columns: [] }
  return { rows: rows as Record<string, unknown>[], columns: Object.keys(rows[0]) }
}

function cleanVal(val: unknown): string {
  return String(val ?? '').normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toUpperCase()
}

// ─── Photo Thumb ──────────────────────────────────────────────────────────────

function PhotoThumb({
  file,
  analysis,
  onRemove,
}: {
  file: File
  analysis: PhotoAnalysis | null
  onRemove: () => void
}) {
  const [preview, setPreview] = useState<string | null>(null)

  useState(() => {
    fileToBase64(file).then(setPreview)
  })

  return (
    <div className="relative group">
      {preview && (
        <img
          src={preview}
          alt={file.name}
          className="h-24 w-24 object-cover rounded-lg border"
        />
      )}
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 rounded-b-lg truncate px-1">
        {analysis ? (
          <span className="text-emerald-300">{analysis.items.length} шт</span>
        ) : (
          <span className="text-white/70">{file.name.slice(0, 15)}</span>
        )}
      </div>
      {analysis?.error && (
        <div className="absolute top-0 left-0 right-0 bg-red-500/80 text-white text-[10px] text-center py-0.5 rounded-t-lg">
          Ошибка
        </div>
      )}
    </div>
  )
}

// ─── Analysis Detail ──────────────────────────────────────────────────────────

function AnalysisCard({ analysis }: { analysis: PhotoAnalysis }) {
  const [open, setOpen] = useState(false)

  if (analysis.error) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          <span>{analysis.fileName}: {analysis.error}</span>
        </div>
      </Card>
    )
  }

  if (analysis.items.length === 0) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" />
          <span>{analysis.fileName}: ничего не распознано</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-3">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-primary" />
          <span className="font-medium">{analysis.fileName}</span>
          <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
            {analysis.items.length} поз.
          </Badge>
        </div>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 border-t pt-2 space-y-1">
          {analysis.items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="font-mono font-semibold text-foreground">{item.article}</span>
              {item.box && <Badge variant="secondary" className="text-[10px] h-5">{item.box}</Badge>}
              <span className="text-muted-foreground">—</span>
              <span className="font-semibold text-primary">{item.quantity} шт</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Column Mapper ────────────────────────────────────────────────────────────

function ColumnMapper({
  columns,
  articleCol,
  setArticleCol,
  quantityCol,
  setQuantityCol,
  boxCol,
  setBoxCol,
  showBox,
}: {
  columns: string[]
  articleCol: string
  setArticleCol: (v: string) => void
  quantityCol: string
  setQuantityCol: (v: string) => void
  boxCol: string
  setBoxCol: (v: string) => void
  showBox: boolean
}) {
  const handleAuto = () => {
    setArticleCol(autoDetect(columns, ARTICLE_NAMES))
    setQuantityCol(autoDetect(columns, QUANTITY_NAMES))
    if (showBox) setBoxCol(autoDetect(columns, BOX_NAMES))
    toast.success('Колонки определены автоматически')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Настройка колонок</p>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleAuto}>
          <Zap className="h-3.5 w-3.5 mr-1" />
          Авто
        </Button>
      </div>
      <div className={cn('grid gap-2', showBox ? 'grid-cols-3' : 'grid-cols-2')}>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Артикул</label>
          <Select value={articleCol} onValueChange={setArticleCol}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {showBox && (
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Короб</label>
            <Select value={boxCol} onValueChange={setBoxCol}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Количество</label>
          <Select value={quantityCol} onValueChange={setQuantityCol}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

// ─── Results Table ────────────────────────────────────────────────────────────

function ResultsTable({ results, showBox }: { results: UpdatedRow[]; showBox: boolean }) {
  const [filter, setFilter] = useState<'all' | 'unchanged' | 'reduced' | 'picked_up'>('all')

  const filtered = filter === 'all' ? results : results.filter((r) => r.status === filter)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Фильтр:</span>
        {([
          { key: 'all', label: 'Все', count: results.length },
          { key: 'unchanged', label: 'Без изменений', count: results.filter((r) => r.status === 'unchanged').length },
          { key: 'reduced', label: 'Уменьшено', count: results.filter((r) => r.status === 'reduced').length },
          { key: 'picked_up', label: 'Выбрано полностью', count: results.filter((r) => r.status === 'picked_up').length },
        ] as const).map(({ key, label, count }) => (
          <Button key={key} variant={filter === key ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setFilter(key)}>
            {label} ({count})
          </Button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-xs">Артикул</th>
                {showBox && <th className="px-3 py-2.5 text-left font-semibold text-xs">Короб</th>}
                <th className="px-3 py-2.5 text-left font-semibold text-xs">Было</th>
                <th className="px-3 py-2.5 text-center font-semibold text-xs">Выбрано</th>
                <th className="px-3 py-2.5 text-left font-semibold text-xs">Осталось</th>
                <th className="px-3 py-2.5 text-left font-semibold text-xs">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-t transition-colors hover:bg-muted/30',
                    row.status === 'picked_up' && 'bg-emerald-50/50 dark:bg-emerald-950/10',
                    row.status === 'reduced' && 'bg-amber-50/50 dark:bg-amber-950/10'
                  )}
                >
                  <td className="px-3 py-2 font-mono font-medium text-xs">{row.article}</td>
                  {showBox && <td className="px-3 py-2 text-xs">{row.box || '—'}</td>}
                  <td className="px-3 py-2 text-xs">{row.originalQuantity}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-primary text-center">{row.picked > 0 ? row.picked : '—'}</td>
                  <td className="px-3 py-2 text-xs font-bold">{row.quantity}</td>
                  <td className="px-3 py-2">
                    {row.status === 'unchanged' && (
                      <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground">
                        <Circle className="h-3 w-3 mr-0.5" /> Без изменений
                      </Badge>
                    )}
                    {row.status === 'reduced' && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                        <MinusCircle className="h-3 w-3 mr-0.5" /> Уменьшено
                      </Badge>
                    )}
                    {row.status === 'picked_up' && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Выбрано
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Нет данных для фильтра</p>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportExcel(results: UpdatedRow[], showBox: boolean) {
  const XLSX = await import('xlsx')

  // Build header row and data rows as arrays for guaranteed column order
  const headers: string[] = ['Артикул']
  if (showBox) headers.push('Короб')
  headers.push('Количество', 'Было', 'Выбрано', 'Статус')

  const aoa: (string | number)[][] = [headers]

  for (const r of results) {
    const row: (string | number)[] = [r.article]
    if (showBox) row.push(r.box || '')
    row.push(r.quantity, r.originalQuantity, r.picked)
    row.push(r.status === 'picked_up' ? 'Выбрано полностью' : r.status === 'reduced' ? 'Уменьшено' : 'Без изменений')
    aoa.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Результат Циклоп')
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
  XLSX.writeFile(wb, `cyclops-${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Результат экспортирован в Excel')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CyclopsPage() {
  const [photos, setPhotos] = useState<File[]>([])
  const [analyses, setAnalyses] = useState<PhotoAnalysis[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [invFile, setInvFile] = useState<{ name: string; rows: Record<string, unknown>[]; columns: string[]; rawFile: File } | null>(null)
  const [articleCol, setArticleCol] = useState('')
  const [quantityCol, setQuantityCol] = useState('')
  const [boxCol, setBoxCol] = useState('')
  const [hasBoxColumn, setHasBoxColumn] = useState(false)
  const [results, setResults] = useState<UpdatedRow[] | null>(null)
  const [unmatched, setUnmatched] = useState<{ article: string; quantity: number }[]>([])
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [photoDragOver, setPhotoDragOver] = useState(false)
  const [excelDragOver, setExcelDragOver] = useState(false)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const photoDragCounter = useRef(0)
  const excelDragCounter = useRef(0)

  // ─── Photo handling ─────────────────────────────────────────────
  const addPhotos = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (arr.length === 0) {
      toast.error('Выберите фото')
      return
    }
    setPhotos((prev) => [...prev, ...arr])
    setResults(null)
  }, [])

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
    setAnalyses((prev) => prev.filter((_, i) => i !== idx))
    setResults(null)
  }, [])

  // ─── Inventory handling ─────────────────────────────────────────
  const handleExcelUpload = useCallback(async (file: File) => {
    try {
      const { rows, columns } = await readExcel(file)
      if (rows.length === 0) {
        toast.error('Файл пуст')
        return
      }
      setInvFile({ name: file.name, rows, columns, rawFile: file })
      setArticleCol(autoDetect(columns, ARTICLE_NAMES))
      setQuantityCol(autoDetect(columns, QUANTITY_NAMES))
      setBoxCol(autoDetect(columns, BOX_NAMES))
      const hasBox = columns.some((c) => autoDetect([c], BOX_NAMES) === c)
      setHasBoxColumn(hasBox)
      setResults(null)
      toast.success(`Загружено: ${file.name} (${rows.length} строк)`)
    } catch {
      toast.error('Ошибка чтения Excel')
    }
  }, [])

  const photoDragHandlers = useMemo(() => ({
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); photoDragCounter.current++; setPhotoDragOver(true) },
    onDragOver:  (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); photoDragCounter.current--; if (photoDragCounter.current <= 0) { photoDragCounter.current = 0; setPhotoDragOver(false) } },
    onDrop:      (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); photoDragCounter.current = 0; setPhotoDragOver(false); if (e.dataTransfer.files.length) addPhotos(e.dataTransfer.files) },
  }), [addPhotos])

  const excelDragHandlers = useMemo(() => ({
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); excelDragCounter.current++; setExcelDragOver(true) },
    onDragOver:  (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); excelDragCounter.current--; if (excelDragCounter.current <= 0) { excelDragCounter.current = 0; setExcelDragOver(false) } },
    onDrop:      (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); excelDragCounter.current = 0; setExcelDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleExcelUpload(f) },
  }), [handleExcelUpload])

  const analyzeAllPhotos = useCallback(async () => {
    if (photos.length === 0) {
      toast.error('Добавьте хотя бы одно фото')
      return
    }
    setAnalyzing(true)
    const newAnalyses: PhotoAnalysis[] = []

    for (const photo of photos) {
      try {
        const base64 = await fileToBase64(photo)
        const res = await fetch('/api/cyclops/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, fileName: photo.name }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          newAnalyses.push({ fileName: photo.name, items: [], error: err.error || 'Ошибка сервера' })
          continue
        }
        const data = await res.json()
        newAnalyses.push({ fileName: photo.name, items: data.items || [] })
      } catch (err) {
        newAnalyses.push({ fileName: photo.name, items: [], error: String(err) })
      }
    }

    setAnalyses(newAnalyses)
    setAnalyzing(false)
    setResults(null)

    const totalItems = newAnalyses.reduce((s, a) => s + a.items.length, 0)
    const errors = newAnalyses.filter((a) => a.error).length
    if (errors > 0) {
      toast.error(`${errors} из ${photos.length} фото не удалось распознать`)
    } else {
      toast.success(`Распознано ${totalItems} позиций из ${photos.length} фото`)
    }
  }, [photos])

  // ─── Run calculation ────────────────────────────────────────────
  const runCalc = useCallback(() => {
    if (!invFile || !articleCol || !quantityCol) {
      toast.error('Загрузите Excel и настройте колонки')
      return
    }
    if (analyses.length === 0) {
      toast.error('Сначала распознайте фото')
      return
    }

    const totalInFile = invFile.rows.length

    const inventory: InventoryRow[] = invFile.rows
      .map((row) => ({
        article: cleanVal(row[articleCol]),
        quantity: Math.floor(Number(row[quantityCol])) || 0,
        box: hasBoxColumn && boxCol ? String(row[boxCol] || '').trim() : undefined,
      }))
      .filter((r) => r.article && r.quantity > 0)

    if (inventory.length === 0) {
      toast.error(`В файле ${totalInFile} строк, но ни одна не прошла фильтр. Проверьте колонки: «${articleCol}» и «${quantityCol}»`)
      return
    }

    const skipped = totalInFile - inventory.length

    const allPicked = analyses.flatMap((a) => a.items)

    const updated = subtractFromInventory(inventory, allPicked)
    const unmatchedItems = findUnmatchedPicked(inventory, allPicked)

    setResults(updated)
    setUnmatched(
      unmatchedItems.map((p) => ({ article: p.article, quantity: p.quantity }))
    )

    if (skipped > 0) {
      toast.info(`Файл: ${totalInFile} строк → ${inventory.length} с данными (пропущено ${skipped}: пустой артикул или нулевое количество)`)
    } else {
      toast.success(`Расчёт выполнен (${inventory.length} строк)`)
    }
  }, [invFile, articleCol, quantityCol, boxCol, hasBoxColumn, analyses])

  const reset = useCallback(() => {
    setPhotos([])
    setAnalyses([])
    setInvFile(null)
    setResults(null)
    setUnmatched([])
    setArticleCol('')
    setQuantityCol('')
    setBoxCol('')
    setHasBoxColumn(false)
  }, [])

  const totalPickedFromPhotos = analyses.reduce((s, a) => s + a.items.length, 0)
  const summary = results ? getCyclopsSummary(results, unmatched.length) : null

  const downloadRawFile = useCallback(() => {
    if (!invFile?.rawFile) return
    const url = URL.createObjectURL(invFile.rawFile)
    const a = document.createElement('a')
    a.href = url
    a.download = invFile.name
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Файл инвентаря скачан')
  }, [invFile])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
            <Camera className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Циклоп</h2>
            <p className="text-xs text-muted-foreground">
              AI-распознавание артикулов с фото и вычитание из инвентаря
            </p>
          </div>
        </div>
        {results && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сбросить
          </Button>
        )}
      </div>

      {!results ? (
        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {/* Step 1: Upload photos */}
          <Card
            className={cn(
              'border-2 border-dashed transition-all duration-200',
              photoDragOver
                ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/20 scale-[1.005] shadow-lg shadow-sky-500/10'
                : 'hover:border-primary/40'
            )}
            {...photoDragHandlers}
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-xs font-bold text-sky-700 dark:text-sky-300">
                  1
                </div>
                <p className="text-sm font-semibold">Загрузите фото коробов</p>
              </div>

              <div className="flex items-center gap-3 flex-wrap min-h-[96px]">
                {photos.map((photo, i) => (
                  <PhotoThumb
                    key={`${photo.name}-${i}`}
                    file={photo}
                    analysis={analyses[i] || null}
                    onRemove={() => removePhoto(i)}
                  />
                ))}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className={cn(
                    'h-24 w-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors shrink-0',
                    photoDragOver
                      ? 'border-sky-400 text-sky-500'
                      : 'border-muted-foreground/25 hover:border-primary/50 text-muted-foreground hover:text-primary'
                  )}
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[10px]">Добавить</span>
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addPhotos(e.target.files)
                    if (photoInputRef.current) photoInputRef.current.value = ''
                  }}
                />
              </div>

              {photos.length === 0 && !photoDragOver && (
                <p className="text-center text-xs text-muted-foreground -mt-1">
                  Перетащите фото в эту область или нажмите кнопку
                </p>
              )}
              {photoDragOver && (
                <p className="text-center text-xs font-medium text-sky-600 dark:text-sky-400 -mt-1">
                  <Upload className="h-3.5 w-3.5 inline mr-1" />
                  Отпустите фото для загрузки
                </p>
              )}

              {photos.length > 0 && (
                <Button
                  onClick={analyzeAllPhotos}
                  disabled={analyzing}
                  className="bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white shadow-lg shadow-sky-500/25"
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  {analyzing ? `Распознаю... (${analyses.length}/${photos.length})` : 'Распознать все фото'}
                </Button>
              )}

              {analyses.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    Результаты распознавания ({totalPickedFromPhotos} позиций):
                  </p>
                  {analyses.map((a, i) => (
                    <AnalysisCard key={i} analysis={a} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Upload Excel */}
          <Card
            className={cn(
              'border-2 border-dashed transition-all duration-200',
              excelDragOver
                ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/20 scale-[1.005] shadow-lg shadow-sky-500/10'
                : invFile
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'hover:border-primary/40'
            )}
            {...excelDragHandlers}
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-xs font-bold text-sky-700 dark:text-sky-300">
                  2
                </div>
                <p className="text-sm font-semibold">Загрузите Excel с инвентарём</p>
              </div>

              <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleExcelUpload(f)
                if (excelInputRef.current) excelInputRef.current.value = ''
              }} />

              {invFile ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">{invFile.name}</span>
                    <Badge variant="outline" className="text-xs">{invFile.rows.length} строк</Badge>
                    <Button variant="ghost" size="sm" className="text-xs h-6 gap-1" onClick={downloadRawFile}>
                      <Download className="h-3.5 w-3.5" />
                      Скачать
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-6 ml-auto" onClick={() => excelInputRef.current?.click()}>
                      Заменить
                    </Button>
                  </div>
                  <ColumnMapper
                    columns={invFile.columns}
                    articleCol={articleCol}
                    setArticleCol={setArticleCol}
                    quantityCol={quantityCol}
                    setQuantityCol={setQuantityCol}
                    boxCol={boxCol}
                    setBoxCol={setBoxCol}
                    showBox={hasBoxColumn}
                  />
                </div>
              ) : (
                <div
                  onClick={() => excelInputRef.current?.click()}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 py-8 rounded-lg cursor-pointer transition-colors',
                    excelDragOver ? 'text-sky-500' : 'text-muted-foreground hover:text-primary'
                  )}
                >
                  <FileSpreadsheet className="h-8 w-8" />
                  <p className={cn('text-sm', excelDragOver && 'font-medium')}>
                    {excelDragOver ? 'Отпустите файл для загрузки' : 'Перетащите Excel сюда или нажмите для выбора'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Calculate */}
          <div className="flex justify-center">
            <Button
              size="lg"
              disabled={!invFile || analyses.length === 0 || !articleCol || !quantityCol}
              onClick={runCalc}
              className="px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white shadow-lg shadow-sky-500/25"
            >
              <Columns3 className="h-5 w-5 mr-2" />
              Сверить и рассчитать
            </Button>
          </div>

          {/* Help */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <PackageSearch className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground text-sm">Как работает Циклоп</p>
                  <p><strong>1.</strong> Загрузите фото коробов — AI распознает артикулы, номера коробов и количество</p>
                  <p><strong>2.</strong> Загрузите Excel с текущим инвентарём (артикул, количество)</p>
                  <p><strong>3.</strong> Циклоп вычтет распознанное из инвентаря по паре (артикул + короб)</p>
                  <p className="text-muted-foreground/70 italic">Если у короба есть приписка типа «1 этаж — удалено 1 шт» — она автоматически игнорируется</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-2xl font-bold">{summary?.totalOriginal}</p>
              <p className="text-xs text-muted-foreground">Всего в Excel</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-primary">{summary?.totalPicked}</p>
              <p className="text-xs text-muted-foreground">Выбрано всего</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary?.totalRemaining}</p>
              <p className="text-xs text-muted-foreground">Осталось</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{summary?.pickedUp}</p>
              <p className="text-xs text-muted-foreground">Выбрано полностью</p>
            </Card>
          </div>

          {/* Export */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportExcel(results, hasBoxColumn)} className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40">
              <Download className="h-4 w-4 mr-1.5" />
              Скачать Excel
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Новая сверка
            </Button>
          </div>

          {/* Results table */}
          <ResultsTable results={results} showBox={hasBoxColumn} />

          {/* Unmatched items warning */}
          {unmatched.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <button onClick={() => setShowUnmatched(!showUnmatched)} className="flex items-center gap-2 w-full text-left">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {unmatched.length} артикулов с фото не найдены в Excel
                  </span>
                  <ChevronDown className={cn('h-4 w-4 ml-auto transition-transform', showUnmatched && 'rotate-180')} />
                </button>
                {showUnmatched && (
                  <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800 space-y-1">
                    {unmatched.map((u, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-sky-600 dark:text-sky-400">
                        <span className="font-mono">{u.article}</span>
                        <span>{u.quantity} шт</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  )
}
