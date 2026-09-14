'use client'

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Download, FileSpreadsheet, Filter, Package, RefreshCcw, RotateCw, Search, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type RawRow = Record<string, string | number | null | undefined>
type FileData = { name: string; rows: RawRow[]; columns: string[]; format?: 'spreadsheet' | 'pdf'; fileCount?: number; fileNames?: string[] }
type Mapping = { article: string; box: string; quantity: string }
type InventoryRow = { article: string; box: string; quantity: number }
type AuditStatus = 'updated' | 'not_found' | 'insufficient'
type AuditRow = { article: string; box: string; before: number; writtenOff: number; remaining: number; status: AuditStatus; note?: string }

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
  .replace(/[‐‑‒–—―]/g, '-')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase()

// Box labels can be copied from systems that mix Cyrillic and Latin lookalikes:
// e.g. "2в104" and "2b104" are visually the same warehouse location.
const normalizeBox = (value: unknown) => normalize(value)
  .replace(/[АВЕКМНОРСТХУ]/g, (letter) => ({ А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' })[letter] ?? letter)

const keyOf = (article: string, box: string) => `${normalize(article)}::${normalizeBox(box)}`
const toNumber = (value: unknown) => {
  const text = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.')
  const parsed = Number(text) || Number(text.match(/-?\d+(?:\.\d+)?/)?.[0] ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
function findColumn(columns: string[], candidates: string[]) {
  return columns.find((column) => candidates.some((candidate) => normalize(column).includes(normalize(candidate)))) ?? ''
}
function baseMapping(columns: string[]): Mapping {
  return { article: findColumn(columns, ['артикул', 'article', 'sku', 'арт', 'код']), box: findColumn(columns, ['короб', 'box', 'ящик', 'коробка', 'место']), quantity: findColumn(columns, ['количество', 'quantity', 'qty', 'остаток', 'в наличии', 'шт']) }
}
function jarvisMapping(columns: string[]): Mapping {
  return { article: findColumn(columns, ['артикул', 'article', 'sku', 'арт', 'код']), box: findColumn(columns, ['короб', 'box', 'ящик', 'коробка', 'место']), quantity: findColumn(columns, ['собрано', 'списать', 'allocated', 'picked', 'взято']) || findColumn(columns, ['нужно', 'need']) }
}
async function readSpreadsheet(file: File): Promise<FileData> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' })
  return { name: file.name, rows, columns: rows[0] ? Object.keys(rows[0]) : [], format: 'spreadsheet' }
}

async function readDeletionPdf(file: File | File[]): Promise<FileData> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
  const files = Array.isArray(file) ? file : [file]
  const rows: RawRow[] = []
  for (const sourceFile of files) {
    const document = await pdfjs.getDocument({ data: new Uint8Array(await sourceFile.arrayBuffer()) }).promise
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
    const lines = new Map<number, Array<{ x: number; text: string }>>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const line = lines.get(y) ?? []
      line.push({ x: item.transform[4], text: item.str.trim() })
      lines.set(y, line)
    }
      for (const parts of [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, value]) => value.sort((a, b) => a.x - b.x))) {
        const line = parts.map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim()
        const match = line.match(/^\d+\s+([^\s]+)\s+(\d+(?:[.,]\d+)?)\s+(OZON|WB)\s+(.+)$/i)
        if (!match) continue
        const [, article, quantity, marketplace, box] = match
        rows.push({ Артикул: article, Количество: toNumber(quantity), Маркетплейс: marketplace.toUpperCase(), Короб: box.trim() })
      }
    }
  }
  return { name: files.length > 1 ? `${files.length} PDF-файла` : files[0].name, fileNames: files.map((sourceFile) => sourceFile.name), rows, columns: ['Артикул', 'Количество', 'Маркетплейс', 'Короб'], format: 'pdf', fileCount: files.length }
}
function parseRows(file: FileData, mapping: Mapping, carryArticle = false): InventoryRow[] {
  let previousArticle = ''
  return file.rows.flatMap((row) => {
    const rawArticle = String(row[mapping.article] ?? '').trim()
    const article = rawArticle || (carryArticle ? previousArticle : '')
    if (rawArticle) previousArticle = rawArticle
    const box = String(row[mapping.box] ?? '').trim()
    const quantity = toNumber(row[mapping.quantity])
    return article && box && box !== '—' && quantity ? [{ article, box, quantity }] : []
  })
}

function parseJarvisRows(file: FileData, mapping: Mapping) {
  const isLegacyReport = normalize(mapping.quantity).includes('НУЖНО')
  if (!isLegacyReport) return { rows: parseRows(file, mapping, true), isLegacyReport: false }

  const rows: InventoryRow[] = []
  for (const row of file.rows) {
    const rawArticle = String(row[mapping.article] ?? '').trim()
    const quantity = toNumber(row[mapping.quantity])
    if (rawArticle && quantity) rows.push({ article: rawArticle, box: '', quantity })
  }
  return { rows, isLegacyReport: true }
}

function applyLegacyWriteOff(baseRows: InventoryRow[], needs: InventoryRow[]) {
  const updated = baseRows.map((row) => ({ ...row }))
  const pendingByArticle = new Map<string, InventoryRow>()
  for (const need of needs) {
    const key = normalize(need.article)
    const current = pendingByArticle.get(key)
    pendingByArticle.set(key, current ? { ...current, quantity: current.quantity + need.quantity } : { ...need })
  }

  const audit: AuditRow[] = []
  let totalWrittenOff = 0
  for (const row of updated) {
    const pending = pendingByArticle.get(normalize(row.article))
    if (!pending?.quantity) continue
    const before = row.quantity
    const writtenOff = Math.min(before, pending.quantity)
    if (!writtenOff) continue
    row.quantity -= writtenOff
    pending.quantity -= writtenOff
    totalWrittenOff += writtenOff
    audit.push({ article: row.article, box: row.box, before, writtenOff, remaining: row.quantity, status: 'updated' })
  }
  for (const pending of pendingByArticle.values()) {
    if (pending.quantity) audit.push({ article: pending.article, box: '—', before: 0, writtenOff: 0, remaining: 0, status: 'insufficient', note: `Не списано ${pending.quantity} шт` })
  }
  return { updated, audit, totalWrittenOff }
}
function applyWriteOff(baseRows: InventoryRow[], pickedRows: InventoryRow[]) {
  const updated = baseRows.map((row) => ({ ...row }))
  const indexes = new Map<string, number[]>()
  updated.forEach((row, index) => indexes.set(keyOf(row.article, row.box), [...(indexes.get(keyOf(row.article, row.box)) ?? []), index]))
  const picked = new Map<string, InventoryRow>()
  for (const row of pickedRows) {
    const key = keyOf(row.article, row.box)
    const current = picked.get(key)
    picked.set(key, current ? { ...current, quantity: current.quantity + row.quantity } : { ...row })
  }
  const audit: AuditRow[] = []
  let totalWrittenOff = 0
  for (const row of picked.values()) {
    let pending = row.quantity
    const matches = indexes.get(keyOf(row.article, row.box)) ?? []
    if (!matches.length) { audit.push({ article: row.article, box: row.box, before: 0, writtenOff: 0, remaining: 0, status: 'not_found', note: 'Не найдено в базе' }); continue }
    for (const index of matches) {
      if (!pending) break
      const before = updated[index].quantity
      const writtenOff = Math.min(before, pending)
      updated[index].quantity -= writtenOff; pending -= writtenOff; totalWrittenOff += writtenOff
      if (writtenOff) audit.push({ article: updated[index].article, box: updated[index].box, before, writtenOff, remaining: updated[index].quantity, status: 'updated' })
    }
    if (pending) audit.push({ article: row.article, box: row.box, before: 0, writtenOff: 0, remaining: 0, status: 'insufficient', note: `Не списано ${pending} шт` })
  }
  return { updated, audit, totalWrittenOff }
}

function ColumnSelect({ columns, value, onChange }: { columns: string[]; value: string; onChange: (value: string) => void }) {
  return <SelectRoot value={value || undefined} onValueChange={onChange}><SelectTrigger className="mt-1 h-9 w-full border-[#dfe6ef] bg-[#fbfcfe] text-xs text-[#243454] focus:border-[#e11d48] focus:ring-[#e11d48]/10"><SelectValue placeholder="Выберите столбец" /></SelectTrigger><SelectContent>{columns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}</SelectContent></SelectRoot>
}

function MappingFields({ columns, value, onChange, quantityLabel }: { columns: string[]; value: Mapping; onChange: (value: Mapping) => void; quantityLabel: string }) {
  const fields: Array<[keyof Mapping, string]> = [['article', 'Артикул'], ['box', 'Короб'], ['quantity', quantityLabel]]
  return <div className="mt-3 grid gap-2 border-t border-[#edf1f5] pt-3 sm:grid-cols-3">{fields.map(([field, label]) => <label key={field} className="text-[11px] font-medium text-[#71819a]">{label}<ColumnSelect columns={columns} value={value[field]} onChange={(selected) => onChange({ ...value, [field]: selected })} /></label>)}</div>
}

function UploadCard({ title, hint, file, onFile, accept = '.xlsx,.xls,.csv', multiple = false }: { title: string; hint: string; file: FileData | null; onFile: (file: File | File[]) => void; accept?: string; multiple?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { const chosen = Array.from(event.target.files ?? []); if (chosen.length) onFile(multiple ? chosen : chosen[0]); event.target.value = '' }
  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const chosen = Array.from(event.dataTransfer.files ?? [])
    if (chosen.length) onFile(multiple ? chosen : chosen[0])
  }
  return <div className="min-w-0 rounded-lg border border-[#dfe6ef] bg-white p-4 shadow-none">
    <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={handleChange} />
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fff0f3] text-[#e11d48]"><FileSpreadsheet className="h-[18px] w-[18px]" /></span>
        <div><h2 className="text-sm font-bold text-[#15274f]">{title}</h2><p className="mt-1 text-[11px] text-[#7a8aa2]">{hint}</p></div>
      </div>
      {file?.fileCount && file.fileCount > 1 ? <span className="shrink-0 text-xs font-bold text-[#d61f45]">{file.fileCount} файла</span> : null}
    </div>
    <button type="button" aria-label={`Добавить ${multiple ? 'PDF-файлы' : 'файл базы'}`} onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDragging(true) }} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false) }} onDrop={handleDrop} className={`flex h-[104px] w-full flex-col items-center justify-center rounded-md border border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/30 ${isDragging ? 'border-[#e11d48] bg-[#fff0f3]' : 'border-[#f1a9b7] bg-[#fff9fa] hover:border-[#e11d48] hover:bg-[#fff4f6]'}`}>
      <Upload className="mb-2 h-5 w-5 text-[#e11d48]" /><span className="text-xs font-bold text-[#d61f45]">{multiple ? 'Добавить PDF-файлы' : 'Добавить файл'}</span><span className="mt-1 text-[11px] text-[#7a8aa2]">Перетащите сюда или выберите на устройстве</span>
    </button>
    {file ? <div className="mt-3 space-y-1.5">
      {(file.fileNames?.length ? file.fileNames : [file.name]).map((name, index) => <div key={`${name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md border border-[#e7edf3] bg-[#fbfcfe] px-3 py-2">
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-[#e11d48]" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#334666]">{name}</span>
        {index === 0 && <span className="shrink-0 text-[10px] text-[#8b99ad]">{file.rows.length.toLocaleString('ru-RU')} строк</span>}
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#20ad70]" />
      </div>)}
      <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} className="mt-1 h-7 px-1 text-[11px] text-[#60718b] hover:bg-transparent hover:text-[#d61f45]">Заменить файлы</Button>
    </div> : <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8b99ad]"><FileSpreadsheet className="h-4 w-4 text-[#7c8da5]" />Поддерживаются: {multiple ? 'PDF' : 'XLSX, XLS, CSV'}</div>}
  </div>
}
function StatusBadge({ status, note }: { status: AuditStatus; note?: string }) {
  return status === 'updated' ? <Badge className="gap-1 border-[#bfe7d2] bg-[#eefaf3] text-[#178956] hover:bg-[#e4f7ed]"><CheckCircle2 className="h-3 w-3" />Обновить</Badge> : <Badge className={status === 'not_found' ? 'gap-1 border-[#f2b7c2] bg-[#fff1f3] text-[#cf2346] hover:bg-[#ffe7eb]' : 'gap-1 border-[#f5d6a4] bg-[#fff8ea] text-[#ad6a0b] hover:bg-[#fff3d8]'}><AlertTriangle className="h-3 w-3" />{status === 'not_found' ? 'Не найдено' : note ?? 'Расхождение'}</Badge>
}

function LegacyPashaPage() {
  const [jarvisFile, setJarvisFile] = useState<FileData | null>(null)
  const [baseFile, setBaseFile] = useState<FileData | null>(null)
  const [jarvisColumns, setJarvisColumns] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [baseColumns, setBaseColumns] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [result, setResult] = useState<ReturnType<typeof applyWriteOff> | null>(null)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const errors = useMemo(() => result?.audit.filter((row) => row.status !== 'updated') ?? [], [result])
  const visibleAudit = useMemo(() => (onlyIssues ? errors : result?.audit ?? []), [onlyIssues, errors, result])
  const handleFile = async (file: File | File[], type: 'jarvis' | 'base') => {
    try { const data = await readSpreadsheet(Array.isArray(file) ? file[0] : file); if (!data.rows.length) throw new Error('В файле нет строк данных'); if (type === 'jarvis') { setJarvisFile(data); setJarvisColumns(jarvisMapping(data.columns)) } else { setBaseFile(data); setBaseColumns(baseMapping(data.columns)) }; setResult(null) } catch (error) { toast.error(error instanceof Error ? error.message : 'Не удалось прочитать файл') }
  }
  const run = () => {
    if (!jarvisFile || !baseFile) return toast.error('Загрузите выгрузку Jarvis и базу склада')
    if (Object.values(jarvisColumns).some((value) => !value) || Object.values(baseColumns).some((value) => !value)) return toast.error('Укажите столбцы в обоих файлах')
    const jarvis = parseJarvisRows(jarvisFile, jarvisColumns); const base = parseRows(baseFile, baseColumns)
    if (!jarvis.rows.length) return toast.error('В выгрузке Jarvis не найдены строки для списания')
    if (!base.length) return toast.error('В базе не найдены корректные строки')
    const next = jarvis.isLegacyReport ? applyLegacyWriteOff(base, jarvis.rows) : applyWriteOff(base, jarvis.rows); setResult(next); setOnlyIssues(false); toast.success(jarvis.isLegacyReport ? `ПАША распределил и списал ${next.totalWrittenOff} шт по строкам базы` : `ПАША списал ${next.totalWrittenOff} шт из базы`)
  }
  const exportBase = async () => {
    if (!result) return toast.error('Сначала обновите базу')
    const XLSX = await import('xlsx'); const rows = result.updated.map((row) => ({ 'Артикул': row.article, 'Короб': row.box, 'Количество': row.quantity })); const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Обновлённая база'); XLSX.writeFile(book, `pasha-updated-base-${new Date().toISOString().slice(0, 10)}.xlsx`); toast.success('Обновлённая база скачана')
  }
  const reset = () => { setJarvisFile(null); setBaseFile(null); setResult(null); setOnlyIssues(false); setJarvisColumns({ article: '', box: '', quantity: '' }); setBaseColumns({ article: '', box: '', quantity: '' }) }
  const updatedRows = result?.audit.filter((row) => row.status === 'updated').length ?? 0

  return <section className="mx-auto w-full max-w-[1320px] px-1 py-5 md:px-3 md:py-6">
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_270px_1fr]">
      <div className="relative"><span className="absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white shadow-sm">1</span><UploadCard title="Результат Jarvis" hint="Загрузите файл Excel или CSV" file={jarvisFile} onFile={(file) => handleFile(file, 'jarvis')} />{jarvisFile && <MappingFields columns={jarvisFile.columns} value={jarvisColumns} onChange={setJarvisColumns} quantityLabel="Собрано" />}</div>
      <div className="flex h-full flex-col items-center justify-center py-2 text-center"><div className="hidden items-center gap-3 text-rose-300 lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="h-1.5 w-1.5 rounded-full bg-current" /><div className="relative mx-1 flex h-20 w-24 items-center justify-center bg-rose-400 [clip-path:polygon(0_0,70%_0,70%_18%,100%_50%,70%_82%,70%_100%,0_100%,28%_50%)]"><Database className="ml-2 h-8 w-8 text-white" /></div><span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="h-1.5 w-1.5 rounded-full bg-current" /></div><h2 className="mt-3 text-sm font-semibold text-slate-800">Сопоставление данных</h2><p className="mt-1 max-w-52 text-xs leading-5 text-slate-500">Сверим позиции Jarvis и подготовим обновление базы</p></div>
      <div className="relative"><span className="absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white shadow-sm">2</span><UploadCard title="База склада" hint="Загрузите файл Excel или CSV" file={baseFile} onFile={(file) => handleFile(file, 'base')} />{baseFile && <MappingFields columns={baseFile.columns} value={baseColumns} onChange={setBaseColumns} quantityLabel="Количество" />}</div>
    </div>

    <div className="my-3 flex justify-center"><Button onClick={run} className="h-12 min-w-64 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-7 text-base font-semibold shadow-lg shadow-rose-200 hover:from-rose-600 hover:to-pink-700"><RotateCw className="mr-2 h-5 w-5" />Обновить базу</Button></div>
    <div className="mb-4 flex justify-center"><Button variant="ghost" size="sm" onClick={reset} className="text-slate-500 hover:text-slate-800"><RefreshCcw className="mr-2 h-4 w-4" />Сбросить файлы</Button></div>

    <div className="mx-auto grid max-w-[1120px] gap-5 md:grid-cols-2"><div className="flex min-h-24 items-center gap-5 rounded-xl border border-rose-100 bg-white px-5 py-4 shadow-[0_8px_26px_rgba(92,28,47,0.035)]"><div className="rounded-xl bg-rose-50 p-3 text-rose-500"><Package className="h-7 w-7" /></div><div><p className="text-sm font-medium text-slate-700">Строки к обновлению</p><p className="mt-1 text-3xl font-bold tracking-tight text-rose-500">{updatedRows.toLocaleString('ru-RU')}</p></div><p className="ml-auto max-w-32 text-right text-xs leading-4 text-slate-500">Будет обновлено<br />в базе склада</p></div><div className="flex min-h-24 items-center gap-5 rounded-xl border border-rose-100 bg-white px-5 py-4 shadow-[0_8px_26px_rgba(92,28,47,0.035)]"><div className="rounded-xl bg-orange-50 p-3 text-orange-500"><AlertTriangle className="h-7 w-7" /></div><div><p className="text-sm font-medium text-slate-700">Расхождения</p><p className="mt-1 text-3xl font-bold tracking-tight text-orange-500">{errors.length.toLocaleString('ru-RU')}</p></div><p className="ml-auto max-w-36 text-right text-xs leading-4 text-slate-500">Требуют проверки<br />перед обновлением</p></div></div>

    <div className="mt-4 rounded-xl border border-rose-100 bg-white p-3 shadow-[0_8px_26px_rgba(92,28,47,0.035)] md:p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight text-slate-900">Результат аудита</h2><div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportBase} className="border-rose-200 text-rose-600 hover:bg-rose-50"><Download className="mr-1.5 h-4 w-4" />Экспорт в Excel</Button><Button variant="outline" size="sm" onClick={() => setOnlyIssues((value) => !value)} className={onlyIssues ? 'border-rose-300 bg-rose-50 text-rose-600' : ''}><Filter className="mr-1.5 h-4 w-4" />{onlyIssues ? 'Все строки' : 'Фильтры'}</Button></div></div><div className="overflow-x-auto rounded-lg border border-rose-100"><table className="w-full min-w-[760px] text-sm"><thead className="bg-rose-50/50 text-left text-slate-600"><tr><th className="px-4 py-3 font-medium">Артикул</th><th className="px-4 py-3 font-medium">Короб</th><th className="px-4 py-3 text-right font-medium">Было</th><th className="px-4 py-3 text-right font-medium">Собрано</th><th className="px-4 py-3 text-right font-medium">Осталось</th><th className="px-4 py-3 text-center font-medium">Статус</th></tr></thead><tbody>{visibleAudit.length ? visibleAudit.map((row, index) => <tr key={`${row.article}-${row.box}-${index}`} className="border-t border-rose-100/80 text-slate-700"><td className="px-4 py-3 font-medium">{row.article}</td><td className="px-4 py-3">{row.box}</td><td className="px-4 py-3 text-right">{row.before}</td><td className="px-4 py-3 text-right">{row.writtenOff}</td><td className="px-4 py-3 text-right">{row.remaining}</td><td className="px-4 py-3 text-center"><StatusBadge status={row.status} note={row.note} /></td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Загрузите оба файла и нажмите «Обновить базу» — здесь появится аудит списания.</td></tr>}</tbody></table></div></div>
  </section>
}

type DeletionMapping = { article: string; address: string; ozon: string; wb: string }
type DeletionRow = { article: string; box: string; ozon: number; wb: number; total: number; before: number; remaining: number; status: AuditStatus; note?: string }

function deletionMapping(columns: string[]): DeletionMapping {
  return {
    article: findColumn(columns, ['артикул', 'article', 'sku', 'код']),
    address: findColumn(columns, ['адрес хранения', 'адрес', 'storage', 'короб', 'box']),
    ozon: findColumn(columns, ['ozon', 'озон']),
    wb: findColumn(columns, ['wildberries', 'wildberry', 'wb', 'вб']),
  }
}

function boxFromAddress(value: unknown) {
  return String(value ?? '').trim().split(/[-—–]/, 1)[0].trim()
}

type AddressEntry = { box: string; quantity?: number }

function parseAddressEntries(value: unknown): AddressEntry[] {
  const raw = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  if (!raw) return []

  // One cell may contain several boxes separated by line breaks or commas:
  // "2K2, бокс — удалено 2 шт\n2a384, бокс — удалено 3 шт".
  const entries: AddressEntry[] = []
  const pattern = /([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9._\\/]*)\s*,?\s*(?:бокс|box)?\s*[-—–:]\s*(?:удалено|списано|removed)\s*([\d\s.,]+)/giu
  for (const match of raw.matchAll(pattern)) {
    const box = match[1].trim()
    const quantity = toNumber(match[2])
    if (box && quantity > 0) entries.push({ box, quantity })
  }
  if (entries.length) return entries

  return raw.split(/[\r\n;|]+/).map((part) => ({
    box: part.replace(/\s*,\s*(?:бокс|box)\b.*$/iu, '').split(/[-—–:]/, 1)[0].trim(),
  })).filter((entry) => entry.box)
}

function parseDeletionRows(file: FileData, mapping: DeletionMapping) {
  if (file.format === 'pdf') {
    return file.rows.flatMap((row) => {
      const article = String(row['Артикул'] ?? '').trim()
      const box = String(row['Короб'] ?? '').trim()
      const quantity = toNumber(row['Количество'])
      const marketplace = normalize(row['Маркетплейс'])
      if (!article || !box || !quantity) return []
      return [{ article, box, ozon: marketplace === 'OZON' ? quantity : 0, wb: marketplace === 'WB' ? quantity : 0, total: quantity }]
    })
  }
  return file.rows.flatMap((row) => {
    const article = String(row[mapping.article] ?? '').trim()
    const ozonTotal = toNumber(row[mapping.ozon])
    const wbTotal = toNumber(row[mapping.wb])
    const sourceTotal = ozonTotal + wbTotal
    const entries = parseAddressEntries(row[mapping.address])
    if (!article || !entries.length || sourceTotal <= 0) return []

    // Consume the row total from boxes in the same top-to-bottom order as the
    // source cell. The OZ/WB columns remain authoritative for the total.
    let pending = sourceTotal
    let ozonPending = ozonTotal
    let wbPending = wbTotal
    return entries.flatMap((entry, index) => {
      if (!pending) return []
      const remainingEntries = entries.length - index - 1
      const requested = remainingEntries ? (entry.quantity ?? 0) : pending
      const total = Math.min(pending, requested || pending)
      if (!total) return []
      pending -= total
      const ozon = Math.min(total, ozonPending)
      const wb = Math.min(total - ozon, wbPending)
      ozonPending -= ozon
      wbPending -= wb
      return [{ article, box: entry.box, ozon, wb, total }]
    })
  })
}

function applyDeletion(baseRows: InventoryRow[], deletionRows: ReturnType<typeof parseDeletionRows>) {
  const updated = baseRows.map((row) => ({ ...row }))
  const grouped = new Map<string, { article: string; box: string; ozon: number; wb: number; total: number }>()
  for (const row of deletionRows) {
    const key = keyOf(row.article, row.box)
    const current = grouped.get(key)
    grouped.set(key, current ? { ...current, ozon: current.ozon + row.ozon, wb: current.wb + row.wb, total: current.total + row.total } : { ...row })
  }
  const indexes = new Map<string, number[]>()
  updated.forEach((row, index) => { const key = keyOf(row.article, row.box); indexes.set(key, [...(indexes.get(key) ?? []), index]) })
  const audit: DeletionRow[] = []
  let totalDeleted = 0
  for (const request of grouped.values()) {
    let pending = request.total
    const matches = indexes.get(keyOf(request.article, request.box)) ?? []
    if (!matches.length) { audit.push({ ...request, before: 0, remaining: 0, status: 'not_found', note: 'Не найдено в базе' }); continue }
    for (const index of matches) {
      if (!pending) break
      const before = updated[index].quantity
      const removed = Math.min(before, pending)
      updated[index].quantity -= removed; pending -= removed; totalDeleted += removed
      if (removed) audit.push({ article: updated[index].article, box: updated[index].box, ozon: request.ozon, wb: request.wb, total: removed, before, remaining: updated[index].quantity, status: 'updated' })
    }
    if (pending) audit.push({ ...request, before: 0, remaining: 0, status: 'insufficient', note: `Не удалено ${pending} шт` })
  }
  return { updated, audit, totalDeleted }
}

function Preview({ file }: { file: FileData }) {
  return <div className="mt-3 overflow-x-auto rounded-md border border-[#e4eaf1] bg-[#fbfcfe] p-2"><p className="mb-2 text-[11px] font-bold text-[#71819a]">Предпросмотр первых строк</p><table className="min-w-full text-xs"><thead><tr>{file.columns.slice(0, 6).map((column) => <th key={column} className="border-b border-[#e4eaf1] px-2 py-1 text-left font-bold text-[#71819a]">{column}</th>)}</tr></thead><tbody>{file.rows.slice(0, 4).map((row, index) => <tr key={index} className="border-b border-[#edf1f5] last:border-0">{file.columns.slice(0, 6).map((column) => <td key={column} className="max-w-44 truncate px-2 py-1 text-[#334666]">{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div>
}

function DeletionMappingFields({ columns, value, onChange, base }: { columns: string[]; value: DeletionMapping | Mapping; onChange: (value: DeletionMapping | Mapping) => void; base?: boolean }) {
  const fields: Array<[string, string]> = base ? [['article', 'Артикул'], ['box', 'Короб'], ['quantity', 'Количество']] : [['article', 'Артикул'], ['address', 'Адрес хранения'], ['ozon', 'Ozon удалено'], ['wb', 'WB удалено']]
  const mapped = value as Record<string, string>
  return <div className={`mt-3 grid gap-2 border-t border-[#edf1f5] pt-3 ${base ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{fields.map(([field, label]) => <label key={field} className="text-[11px] font-medium text-[#71819a]">{label}<ColumnSelect columns={columns} value={mapped[field] ?? ''} onChange={(selected) => onChange({ ...value, [field]: selected })} /></label>)}</div>
}

function DeletionPashaPage() {
  const [reportFile, setReportFile] = useState<FileData | null>(null)
  const [baseFile, setBaseFile] = useState<FileData | null>(null)
  const [reportMapping, setReportMapping] = useState<DeletionMapping>({ article: '', address: '', ozon: '', wb: '' })
  const [baseMappingState, setBaseMappingState] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [result, setResult] = useState<ReturnType<typeof applyDeletion> | null>(null)
  const [query, setQuery] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [showReportPreview, setShowReportPreview] = useState(false)
  const [showBasePreview, setShowBasePreview] = useState(false)
  const reportErrors = useMemo(() => result?.audit.filter((row) => row.status !== 'updated') ?? [], [result])
  const visible = useMemo(() => { const source = onlyIssues ? reportErrors : result?.audit ?? []; const needle = normalize(query); return needle ? source.filter((row) => `${normalize(row.article)} ${normalize(row.box)}`.includes(needle)) : source }, [onlyIssues, query, reportErrors, result])
  const handleFile = async (file: File | File[], type: 'report' | 'base') => {
    try {
      const firstFile = Array.isArray(file) ? file[0] : file
      const isPdf = type === 'report' && (Array.isArray(file) || firstFile.name.toLowerCase().endsWith('.pdf'))
      const data = isPdf ? await readDeletionPdf(file) : await readSpreadsheet(firstFile)
      if (!data.rows.length) throw new Error('В файле не найдены строки данных')
      if (type === 'report') { setReportFile(data); setReportMapping(deletionMapping(data.columns)); setShowReportPreview(false) } else { setBaseFile(data); setBaseMappingState(baseMapping(data.columns)); setShowBasePreview(false) }
      setResult(null)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Не удалось прочитать файл') }
  }
  const run = () => {
    if (!reportFile || !baseFile) return toast.error('Загрузите отчёт OZ/WB и базу склада')
    if ((reportFile.format !== 'pdf' && Object.values(reportMapping).some((value) => !value)) || Object.values(baseMappingState).some((value) => !value)) return toast.error('Укажите все столбцы для сопоставления')
    const report = parseDeletionRows(reportFile, reportMapping); const base = parseRows(baseFile, baseMappingState)
    if (!report.length) return toast.error('В отчёте не найдены строки с количеством удаления')
    if (!base.length) return toast.error('В базе не найдены корректные строки')
    const next = applyDeletion(base, report); setResult(next); setOnlyIssues(false); toast.success(`ПАША подготовил удаление ${next.totalDeleted} шт`)
  }
  const exportAll = async () => {
    if (!result) return toast.error('Сначала выполните сопоставление')
    const XLSX = await import('xlsx'); const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(result.updated.map((row) => ({ 'Артикул': row.article, 'Короб': row.box, 'Количество': row.quantity }))), 'Обновлённая база')
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(result.audit.map((row) => ({ 'Артикул': row.article, 'Короб': row.box, Ozon: row.ozon, WB: row.wb, 'Удалено': row.total, 'Было': row.before, 'Осталось': row.remaining, 'Статус': row.status === 'updated' ? 'Совпадает' : row.note ?? 'Расхождение' }))), 'Отчёт ошибок')
    XLSX.writeFile(book, `pasha-oz-wb-${new Date().toISOString().slice(0, 10)}.xlsx`); toast.success('Итоговая база и отчёт ошибок скачаны')
  }
  const reset = () => { setReportFile(null); setBaseFile(null); setResult(null); setQuery(''); setOnlyIssues(false); setReportMapping({ article: '', address: '', ozon: '', wb: '' }); setBaseMappingState({ article: '', box: '', quantity: '' }) }
  const updatedRows = result?.audit.filter((row) => row.status === 'updated').length ?? 0; const deleted = result?.totalDeleted ?? 0
  return <section className="mx-auto w-full max-w-[1280px] space-y-6">
    <div className="flex flex-col gap-3 border-b border-[#dfe6ef] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8190a7]">Склад / ПАША / Удаление OZ/WB</p>
        <h1 className="text-[clamp(1.75rem,3vw,2.7rem)] font-extrabold leading-none tracking-[-0.05em] text-[#10204a]">Результат списания OZ/WB</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#667894]">Добавьте отчёты и текущую базу склада. ПАША объединит дубли по артикулу, коробу и маркетплейсу, затем подготовит обновлённый файл.</p>
      </div>
      <span className="flex shrink-0 items-center gap-2 self-start rounded-full border border-[#d8e0e9] bg-white px-3 py-2 text-xs font-medium text-[#63738c] sm:self-auto"><span className="h-2 w-2 rounded-full bg-[#20ad70]" />Файлы обрабатываются на устройстве</span>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="relative"><span className="absolute -left-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#e11d48] text-xs font-bold text-white shadow-sm">1</span><UploadCard title="Отчёты удаления OZ/WB (PDF)" hint="Загрузите один или несколько PDF" accept=".pdf,.xlsx,.xls,.csv" multiple file={reportFile} onFile={(file) => handleFile(file, 'report')} />{reportFile && <div className="mt-3 rounded-md border border-[#dfe6ef] bg-white p-3">{reportFile.format !== 'pdf' && <DeletionMappingFields columns={reportFile.columns} value={reportMapping} onChange={(value) => setReportMapping(value as DeletionMapping)} />}<Button variant="ghost" size="sm" onClick={() => setShowReportPreview((value) => !value)} className="mt-2 h-7 px-1 text-[11px] text-[#60718b] hover:bg-transparent hover:text-[#d61f45]">{showReportPreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}</Button>{showReportPreview && <Preview file={reportFile} />}</div>}</div>
      <div className="relative"><span className="absolute -left-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#e11d48] text-xs font-bold text-white shadow-sm">2</span><UploadCard title="Текущий файл склада (Excel/CSV)" hint="Загрузите актуальную базу товаров" file={baseFile} onFile={(file) => handleFile(file, 'base')} />{baseFile && <div className="mt-3 rounded-md border border-[#dfe6ef] bg-white p-3"><DeletionMappingFields columns={baseFile.columns} value={baseMappingState} onChange={(value) => setBaseMappingState(value as Mapping)} base /><Button variant="ghost" size="sm" onClick={() => setShowBasePreview((value) => !value)} className="mt-2 h-7 px-1 text-[11px] text-[#60718b] hover:bg-transparent hover:text-[#d61f45]">{showBasePreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}</Button>{showBasePreview && <Preview file={baseFile} />}</div>}</div>
    </div>
    <div className="flex flex-col items-center gap-3 border-y border-[#e4eaf1] py-5 sm:flex-row sm:justify-center"><Button onClick={run} className="h-12 min-w-64 rounded-md bg-[#e11d48] px-8 text-sm font-bold text-white shadow-[0_12px_24px_-12px_rgba(225,29,72,0.7)] hover:bg-[#c9183e] focus-visible:ring-[#e11d48]/30"><RotateCw className="mr-1.5 h-4 w-4" />Обновить базу<ArrowRight className="ml-1 h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={reset} className="h-9 text-xs text-[#60718b] hover:bg-[#f7f9fc] hover:text-[#15274f]"><RefreshCcw className="mr-1.5 h-4 w-4" />Сбросить файлы</Button></div>
    <div className="grid gap-3 md:grid-cols-3"><StatCard icon={<Package />} label="Строк к обновлению" value={updatedRows} tone="rose" hint="Будет обновлено в базе склада" /><StatCard icon={<Database />} label="Удалено товаров" value={deleted} suffix="шт" tone="rose" hint="Ozon + Wildberries" /><StatCard icon={<AlertTriangle />} label="Расхождения" value={reportErrors.length} tone="orange" hint="Требуют проверки перед обновлением" /></div>
    <div className="rounded-lg border border-[#dfe6ef] bg-white p-3 shadow-none sm:p-4"><div className="mb-4 flex flex-col gap-3 border-b border-[#e4eaf1] pb-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-extrabold tracking-[-0.03em] text-[#10204a]">Результат списания</h2><p className="mt-1 text-xs text-[#7a8aa2]">Объединённые строки по артикулу и коробу</p></div><div className="flex flex-wrap gap-2"><label className="flex h-9 items-center gap-2 rounded-md border border-[#dfe6ef] bg-[#fbfcfe] px-3 text-xs text-[#71819a] focus-within:border-[#e11d48]"><Search className="h-4 w-4" /><input aria-label="Поиск по артикулу или коробу" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по артикулу или коробу" className="w-48 bg-transparent outline-none placeholder:text-[#97a4b6]" />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')} className="text-[#8b99ad] hover:text-[#e11d48]">×</button>}</label><Button variant="outline" size="sm" onClick={exportAll} className="border-[#dfe6ef] bg-white text-[#d61f45] hover:border-[#f0a4b3] hover:bg-[#fff6f8]"><Download className="mr-1.5 h-4 w-4" />Экспорт в Excel</Button><Button variant="outline" size="sm" onClick={() => setOnlyIssues((value) => !value)} className={onlyIssues ? 'border-[#f0a4b3] bg-[#fff0f3] text-[#d61f45]' : 'border-[#dfe6ef] bg-white text-[#53647e] hover:bg-[#f7f9fc]'}><Filter className="mr-1.5 h-4 w-4" />{onlyIssues ? 'Все строки' : 'Только ошибки'}</Button></div></div><div className="max-h-[560px] overflow-auto rounded-md border border-[#e4eaf1]"><table className="w-full min-w-[980px] text-sm"><thead className="sticky top-0 z-10 bg-[#f0f4f8] text-left text-[#53647e]"><tr><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide">Артикул</th><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide">Короб</th><th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide">Ozon</th><th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide">WB</th><th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide">Всего удалено</th><th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide">Было</th><th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide">Осталось</th><th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide">Статус</th></tr></thead><tbody>{visible.length ? visible.map((row, index) => <tr key={`${row.article}-${row.box}-${index}`} className="border-t border-[#e4eaf1] text-[#334666] transition-colors hover:bg-[#f8fafc]"><td className="max-w-56 px-4 py-3 font-semibold text-[#15274f]">{row.article}</td><td className="px-4 py-3">{row.box}</td><td className="px-4 py-3 text-right tabular-nums">{row.ozon}</td><td className="px-4 py-3 text-right tabular-nums">{row.wb}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{row.total}</td><td className="px-4 py-3 text-right tabular-nums">{row.before}</td><td className={cn('px-4 py-3 text-right font-semibold tabular-nums', row.remaining < 0 ? 'text-[#cf2346]' : 'text-[#334666]')}>{row.remaining}</td><td className="px-4 py-3 text-center"><StatusBadge status={row.status} note={row.note} /></td></tr>) : <tr><td colSpan={8} className="px-4 py-14 text-center text-[#8a98ac]">Загрузите оба файла и нажмите «Обновить базу» — здесь появится результат.</td></tr>}</tbody></table></div></div>
  </section>
}

function StatCard({ icon, label, value, suffix, tone, hint }: { icon: React.ReactNode; label: string; value: number; suffix?: string; tone: 'rose' | 'orange'; hint: string }) {
  return <div className="flex min-h-24 items-center gap-3 rounded-lg border border-[#dfe6ef] bg-white px-4 py-3 shadow-none"><div className={tone === 'orange' ? 'rounded-md bg-[#fff5e7] p-2.5 text-[#dd8b13]' : 'rounded-md bg-[#fff0f3] p-2.5 text-[#e11d48]'}>{icon}</div><div><p className="text-[11px] font-medium text-[#71819a]">{label}</p><p className={tone === 'orange' ? 'mt-1 text-2xl font-extrabold leading-none tracking-tight text-[#d7780d]' : 'mt-1 text-2xl font-extrabold leading-none tracking-tight text-[#d61f45]'}>{value.toLocaleString('ru-RU')} {suffix && <span className="text-sm">{suffix}</span>}</p></div><p className="ml-auto max-w-36 text-right text-[11px] leading-4 text-[#8794a8]">{hint}</p></div>
}

export function PashaPage() {
  const [mode, setMode] = useState<'legacy' | 'deletion'>('deletion')
  return <div className="space-y-5"><div className="flex flex-col gap-3 border-b border-[#dfe6ef] pb-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8190a7]">ПАША / Рабочие режимы</p><p className="mt-1 text-xs text-[#7a8aa2]">Выберите сценарий обработки данных</p></div><div className="flex w-full overflow-x-auto rounded-md border border-[#dfe6ef] bg-white p-1 sm:w-auto"><button type="button" onClick={() => setMode('legacy')} aria-pressed={mode === 'legacy'} className={cn('shrink-0 rounded px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/30', mode === 'legacy' ? 'bg-[#fff0f3] text-[#d61f45]' : 'text-[#61718a] hover:bg-[#f7f9fc]')}>ПАША — списание Jarvis</button><button type="button" onClick={() => setMode('deletion')} aria-pressed={mode === 'deletion'} className={cn('shrink-0 rounded px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/30', mode === 'deletion' ? 'bg-[#fff0f3] text-[#d61f45]' : 'text-[#61718a] hover:bg-[#f7f9fc]')}>ПАША — удаление OZ/WB</button></div></div>{mode === 'legacy' ? <LegacyPashaPage /> : <DeletionPashaPage />}</div>
}
