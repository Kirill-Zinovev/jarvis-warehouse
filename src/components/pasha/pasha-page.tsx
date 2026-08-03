'use client'

import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Database, Download, FileSpreadsheet, Filter, Package, RefreshCcw, RotateCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type RawRow = Record<string, string | number | null | undefined>
type FileData = { name: string; rows: RawRow[]; columns: string[] }
type Mapping = { article: string; box: string; quantity: string }
type InventoryRow = { article: string; box: string; quantity: number }
type AuditStatus = 'updated' | 'not_found' | 'insufficient'
type AuditRow = { article: string; box: string; before: number; writtenOff: number; remaining: number; status: AuditStatus; note?: string }

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
const keyOf = (article: string, box: string) => `${normalize(article)}::${normalize(box)}`
const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
function findColumn(columns: string[], candidates: string[]) {
  return columns.find((column) => candidates.some((candidate) => normalize(column).includes(normalize(candidate)))) ?? ''
}
function baseMapping(columns: string[]): Mapping {
  return { article: findColumn(columns, ['артикул', 'article', 'sku', 'арт', 'код']), box: findColumn(columns, ['короб', 'box', 'ящик', 'коробка', 'место']), quantity: findColumn(columns, ['количество', 'quantity', 'qty', 'остаток', 'в наличии', 'шт']) }
}
function jarvisMapping(columns: string[]): Mapping {
  return { article: findColumn(columns, ['артикул', 'article', 'sku', 'арт', 'код']), box: findColumn(columns, ['короб', 'box', 'ящик', 'коробка', 'место']), quantity: findColumn(columns, ['собрано', 'списать', 'allocated', 'picked', 'взято']) }
}
async function readSpreadsheet(file: File): Promise<FileData> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' })
  return { name: file.name, rows, columns: rows[0] ? Object.keys(rows[0]) : [] }
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

function MappingFields({ columns, value, onChange, quantityLabel }: { columns: string[]; value: Mapping; onChange: (value: Mapping) => void; quantityLabel: string }) {
  const fields: Array<[keyof Mapping, string]> = [['article', 'Артикул'], ['box', 'Короб'], ['quantity', quantityLabel]]
  return <div className="mt-3 grid gap-2 sm:grid-cols-3">{fields.map(([field, label]) => <label key={field} className="text-xs font-medium text-slate-500">{label}<select className="mt-1 block h-9 w-full rounded-md border border-rose-100 bg-white px-2 text-sm text-slate-800 outline-none focus:border-rose-400" value={value[field]} onChange={(event) => onChange({ ...value, [field]: event.target.value })}><option value="">Выберите столбец</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>)}</div>
}

function UploadCard({ title, hint, file, onFile }: { title: string; hint: string; file: FileData | null; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { const chosen = event.target.files?.[0]; if (chosen) onFile(chosen); event.target.value = '' }
  return <div className="rounded-xl border border-rose-100 bg-white p-3 shadow-[0_8px_24px_rgba(92,28,47,0.035)]">
    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleChange} />
    <div className="mb-3 text-center"><h2 className="text-base font-semibold text-slate-900">{title}</h2><p className="mt-0.5 text-sm text-slate-500">{hint}</p></div>
    <button type="button" onClick={() => inputRef.current?.click()} className="flex h-[118px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-rose-300 bg-rose-50/25 text-center transition hover:border-rose-500 hover:bg-rose-50/60">
      <FileSpreadsheet className="mb-2 h-9 w-9 text-rose-500" strokeWidth={1.7} /><span className="text-sm font-semibold text-rose-600">Перетащите файл сюда</span><span className="mt-1 text-xs text-slate-500">или нажмите для выбора</span>
    </button>
    <div className="mt-3 flex min-h-12 items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
      {file ? <><FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" /><div className="min-w-0 text-left"><p className="truncate font-medium text-slate-700">{file.name}</p><p className="text-xs text-slate-400">Загружено · {file.rows.length} строк</p></div><CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" /></> : <><Upload className="h-4 w-4 text-slate-400" /><span className="text-xs text-slate-400">Excel или CSV</span></>}
    </div>
  </div>
}
function StatusBadge({ status, note }: { status: AuditStatus; note?: string }) {
  return status === 'updated' ? <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-50">Совпадает</Badge> : <Badge className="border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-50"><AlertTriangle className="mr-1 h-3 w-3" />{status === 'not_found' ? 'Не найдено' : note ?? 'Расхождение'}</Badge>
}

export function PashaPage() {
  const [jarvisFile, setJarvisFile] = useState<FileData | null>(null)
  const [baseFile, setBaseFile] = useState<FileData | null>(null)
  const [jarvisColumns, setJarvisColumns] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [baseColumns, setBaseColumns] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [result, setResult] = useState<ReturnType<typeof applyWriteOff> | null>(null)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const errors = useMemo(() => result?.audit.filter((row) => row.status !== 'updated') ?? [], [result])
  const visibleAudit = useMemo(() => (onlyIssues ? errors : result?.audit ?? []), [onlyIssues, errors, result])
  const handleFile = async (file: File, type: 'jarvis' | 'base') => {
    try { const data = await readSpreadsheet(file); if (!data.rows.length) throw new Error('В файле нет строк данных'); if (type === 'jarvis') { setJarvisFile(data); setJarvisColumns(jarvisMapping(data.columns)) } else { setBaseFile(data); setBaseColumns(baseMapping(data.columns)) }; setResult(null) } catch (error) { toast.error(error instanceof Error ? error.message : 'Не удалось прочитать файл') }
  }
  const run = () => {
    if (!jarvisFile || !baseFile) return toast.error('Загрузите выгрузку Jarvis и базу склада')
    if (Object.values(jarvisColumns).some((value) => !value) || Object.values(baseColumns).some((value) => !value)) return toast.error('Укажите столбцы в обоих файлах')
    const picked = parseRows(jarvisFile, jarvisColumns, true); const base = parseRows(baseFile, baseColumns)
    if (!picked.length) return toast.error('В выгрузке Jarvis не найдена колонка «Собрано»')
    if (!base.length) return toast.error('В базе не найдены корректные строки')
    const next = applyWriteOff(base, picked); setResult(next); setOnlyIssues(false); toast.success(`ПАША списал ${next.totalWrittenOff} шт из базы`)
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
