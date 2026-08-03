'use client'

import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  PackageMinus,
  RefreshCcw,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

type RawRow = Record<string, string | number | null | undefined>
type FileData = { name: string; rows: RawRow[]; columns: string[] }
type Mapping = { article: string; box: string; quantity: string }
type InventoryRow = { article: string; box: string; quantity: number }
type AuditStatus = 'updated' | 'not_found' | 'insufficient'
type AuditRow = {
  article: string
  box: string
  before: number
  writtenOff: number
  remaining: number
  status: AuditStatus
  note?: string
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()

const keyOf = (article: string, box: string) => `${normalize(article)}::${normalize(box)}`

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function findColumn(columns: string[], candidates: string[]) {
  return columns.find((column) => candidates.some((candidate) => normalize(column).includes(normalize(candidate))) ?? '') ?? ''
}

function baseMapping(columns: string[]): Mapping {
  return {
    article: findColumn(columns, ['артикул', 'article', 'sku', 'арт', 'код']),
    box: findColumn(columns, ['короб', 'box', 'ящик', 'коробка', 'место']),
    quantity: findColumn(columns, ['количество', 'quantity', 'qty', 'остаток', 'в наличии', 'шт']),
  }
}

function jarvisMapping(columns: string[]): Mapping {
  return {
    article: findColumn(columns, ['артикул', 'article', 'sku', 'арт', 'код']),
    box: findColumn(columns, ['короб', 'box', 'ящик', 'коробка', 'место']),
    quantity: findColumn(columns, ['собрано', 'списать', 'allocated', 'picked', 'взято']),
  }
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
    if (!article || !box || box === '—' || !quantity) return []
    return [{ article, box, quantity }]
  })
}

function applyWriteOff(baseRows: InventoryRow[], pickedRows: InventoryRow[]) {
  const updated = baseRows.map((row) => ({ ...row }))
  const indexes = new Map<string, number[]>()
  updated.forEach((row, index) => {
    const key = keyOf(row.article, row.box)
    indexes.set(key, [...(indexes.get(key) ?? []), index])
  })

  const picked = new Map<string, InventoryRow>()
  for (const row of pickedRows) {
    const key = keyOf(row.article, row.box)
    const current = picked.get(key)
    picked.set(key, current ? { ...current, quantity: current.quantity + row.quantity } : { ...row })
  }

  const audit: AuditRow[] = []
  let totalWrittenOff = 0
  for (const row of picked.values()) {
    let toWriteOff = row.quantity
    const matches = indexes.get(keyOf(row.article, row.box)) ?? []
    if (!matches.length) {
      audit.push({ article: row.article, box: row.box, before: 0, writtenOff: 0, remaining: 0, status: 'not_found', note: 'Короб или артикул не найден в базе' })
      continue
    }
    for (const index of matches) {
      if (!toWriteOff) break
      const before = updated[index].quantity
      const writtenOff = Math.min(before, toWriteOff)
      updated[index].quantity -= writtenOff
      toWriteOff -= writtenOff
      totalWrittenOff += writtenOff
      if (writtenOff) audit.push({ article: updated[index].article, box: updated[index].box, before, writtenOff, remaining: updated[index].quantity, status: 'updated' })
    }
    if (toWriteOff) {
      audit.push({ article: row.article, box: row.box, before: 0, writtenOff: 0, remaining: 0, status: 'insufficient', note: `Не удалось списать ${toWriteOff} шт` })
    }
  }
  return { updated, audit, totalWrittenOff }
}

function MappingFields({ columns, value, onChange, quantityLabel }: { columns: string[]; value: Mapping; onChange: (value: Mapping) => void; quantityLabel: string }) {
  const fields: Array<[keyof Mapping, string]> = [['article', 'Артикул'], ['box', 'Короб'], ['quantity', quantityLabel]]
  return <div className="grid gap-3 sm:grid-cols-3">
    {fields.map(([field, label]) => <label key={field} className="text-xs font-medium text-muted-foreground">{label}
      <select className="mt-1.5 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground" value={value[field]} onChange={(event) => onChange({ ...value, [field]: event.target.value })}>
        <option value="">Выберите столбец</option>
        {columns.map((column) => <option key={column} value={column}>{column}</option>)}
      </select>
    </label>)}
  </div>
}

function UploadCard({ title, hint, file, onFile, icon: Icon }: { title: string; hint: string; file: FileData | null; onFile: (file: File) => void; icon: typeof FileSpreadsheet }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) onFile(selected)
    event.target.value = ''
  }
  return <Card className="border-dashed border-primary/30 bg-primary/[0.025]"><CardContent className="p-5">
    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleChange} />
    <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{hint}</p></div></div>
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" />Загрузить</Button></div>
    {file && <div className="mt-4 flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="truncate font-medium">{file.name}</span><span className="ml-auto text-muted-foreground">{file.rows.length} строк</span></div>}
  </CardContent></Card>
}

function StatusBadge({ status, note }: { status: AuditStatus; note?: string }) {
  if (status === 'updated') return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Списано</Badge>
  return <Badge variant="destructive" className="whitespace-nowrap">{status === 'not_found' ? 'Не найдено' : note ?? 'Недостаток'}</Badge>
}

export function PashaPage() {
  const [jarvisFile, setJarvisFile] = useState<FileData | null>(null)
  const [baseFile, setBaseFile] = useState<FileData | null>(null)
  const [jarvisColumns, setJarvisColumns] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [baseColumns, setBaseColumns] = useState<Mapping>({ article: '', box: '', quantity: '' })
  const [result, setResult] = useState<ReturnType<typeof applyWriteOff> | null>(null)

  const errors = useMemo(() => result?.audit.filter((row) => row.status !== 'updated') ?? [], [result])
  const handleFile = async (file: File, type: 'jarvis' | 'base') => {
    try {
      const data = await readSpreadsheet(file)
      if (!data.rows.length) throw new Error('В файле нет строк данных')
      if (type === 'jarvis') { setJarvisFile(data); setJarvisColumns(jarvisMapping(data.columns)) }
      else { setBaseFile(data); setBaseColumns(baseMapping(data.columns)) }
      setResult(null)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Не удалось прочитать файл') }
  }
  const run = () => {
    if (!jarvisFile || !baseFile) return toast.error('Загрузите выгрузку Jarvis и базу склада')
    if (Object.values(jarvisColumns).some((value) => !value) || Object.values(baseColumns).some((value) => !value)) return toast.error('Укажите столбцы в обоих файлах')
    const picked = parseRows(jarvisFile, jarvisColumns, true)
    const base = parseRows(baseFile, baseColumns)
    if (!picked.length) return toast.error('В выгрузке Jarvis не найдены строки с количеством «Собрано»')
    if (!base.length) return toast.error('В базе не найдены корректные строки')
    const next = applyWriteOff(base, picked)
    setResult(next)
    toast.success(`ПАША списал ${next.totalWrittenOff} шт из складской базы`)
  }
  const exportBase = async (format: 'xlsx' | 'csv') => {
    if (!result) return
    const rows = result.updated.map((row) => ({ 'Артикул': row.article, 'Короб': row.box, 'Количество': row.quantity }))
    const date = new Date().toISOString().slice(0, 10)
    if (format === 'csv') {
      const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
      const content = '\uFEFFАртикул,Короб,Количество\n' + rows.map((row) => [row['Артикул'], row['Короб'], row['Количество']].map(escape).join(',')).join('\n')
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `pasha-updated-base-${date}.csv`; link.click(); URL.revokeObjectURL(url)
    } else {
      const XLSX = await import('xlsx'); const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Обновлённая база'); XLSX.writeFile(book, `pasha-updated-base-${date}.xlsx`)
    }
    toast.success('Обновлённая база скачана')
  }
  const reset = () => { setJarvisFile(null); setBaseFile(null); setResult(null); setJarvisColumns({ article: '', box: '', quantity: '' }); setBaseColumns({ article: '', box: '', quantity: '' }) }

  return <section className="space-y-6">
    <div className="jarvis-hero relative overflow-hidden rounded-3xl px-6 py-7 text-white md:px-8"><div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-rose-100"><PackageMinus className="h-4 w-4" />Протокол списания</div><h1 className="text-3xl font-bold tracking-tight">ПАША</h1><p className="mt-2 max-w-2xl text-sm text-rose-100">Загружает результат Jarvis и вычитает собранный товар из нужных коробов в складской базе.</p></div><Badge className="w-fit bg-white/15 px-3 py-1.5 text-white hover:bg-white/15">Jarvis → ПАША</Badge></div></div>

    <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]"><div className="space-y-3"><UploadCard title="Результат Jarvis" hint="Выгрузка с колонкой «Собрано (шт)»" file={jarvisFile} onFile={(file) => handleFile(file, 'jarvis')} icon={FileSpreadsheet} />{jarvisFile && <MappingFields columns={jarvisFile.columns} value={jarvisColumns} onChange={setJarvisColumns} quantityLabel="Собрано" />}</div><div className="hidden items-center justify-center lg:flex"><div className="rounded-full bg-primary/10 p-3 text-primary"><PackageMinus className="h-6 w-6" /></div></div><div className="space-y-3"><UploadCard title="База склада" hint="Артикул, короб и текущее количество" file={baseFile} onFile={(file) => handleFile(file, 'base')} icon={Database} />{baseFile && <MappingFields columns={baseFile.columns} value={baseColumns} onChange={setBaseColumns} quantityLabel="Количество" />}</div></div>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">ПАША меняет только скачиваемую копию базы — исходные файлы остаются без изменений.</p><div className="flex gap-2"><Button variant="outline" onClick={reset}><RefreshCcw className="mr-2 h-4 w-4" />Сбросить</Button><Button onClick={run}><PackageMinus className="mr-2 h-4 w-4" />Обновить базу</Button></div></div>

    {result && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Списано из базы</p><p className="mt-1 text-2xl font-bold">{result.totalWrittenOff} шт</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Изменено строк</p><p className="mt-1 text-2xl font-bold">{result.audit.filter((row) => row.status === 'updated').length}</p></CardContent></Card><Card className={errors.length ? 'border-amber-300 bg-amber-50/50' : ''}><CardContent className="p-4"><p className="text-sm text-muted-foreground">Требуют внимания</p><p className="mt-1 text-2xl font-bold">{errors.length}</p></CardContent></Card></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Журнал списания</h2><p className="text-sm text-muted-foreground">Все изменения по артикулам и коробам.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportBase('csv')}><Download className="mr-1.5 h-4 w-4" />CSV</Button><Button size="sm" onClick={() => exportBase('xlsx')}><Download className="mr-1.5 h-4 w-4" />Excel</Button></div></div>
      {errors.length > 0 && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Строки с ошибками не списаны сверх фактического остатка. Проверьте их перед выгрузкой обновлённой базы.</p></div>}
      <div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Артикул</th><th className="px-4 py-3 font-medium">Короб</th><th className="px-4 py-3 text-right font-medium">Было</th><th className="px-4 py-3 text-right font-medium">Списано</th><th className="px-4 py-3 text-right font-medium">Осталось</th><th className="px-4 py-3 font-medium">Статус</th></tr></thead><tbody>{result.audit.map((row, index) => <tr key={`${row.article}-${row.box}-${index}`} className="border-t"><td className="px-4 py-3 font-medium">{row.article}</td><td className="px-4 py-3">{row.box}</td><td className="px-4 py-3 text-right">{row.before}</td><td className="px-4 py-3 text-right">{row.writtenOff}</td><td className="px-4 py-3 text-right font-semibold">{row.remaining}</td><td className="px-4 py-3"><StatusBadge status={row.status} note={row.note} /></td></tr>)}</tbody></table></div>
    </div>}
  </section>
}
