import { create } from 'zustand'
import type {
  FileData,
  ColumnMap,
  ShipmentRow,
  WarehouseRow,
  MatchResult,
} from '@/types/jarvis'
import { matchShipments } from '@/lib/jarvis-engine'

interface JarvisState {
  // Uploaded files
  shipmentFile: FileData | null
  setShipmentFile: (file: FileData | null) => void

  warehouseFile: FileData | null
  setWarehouseFile: (file: FileData | null) => void

  // Column mappings
  shipmentColumns: ColumnMap | null
  setShipmentColumns: (cols: ColumnMap | null) => void

  warehouseColumns: ColumnMap | null
  setWarehouseColumns: (cols: ColumnMap | null) => void

  // Parsed data
  shipments: ShipmentRow[]
  warehouse: WarehouseRow[]

  // Results
  results: MatchResult[]
  hasRun: boolean

  // Actions
  runMatch: () => void
  reset: () => void
}

/**
 * Clean a raw Excel string value: normalize Unicode, strip whitespace, keep original for display.
 */
function cleanValue(val: unknown): string {
  return String(val ?? '')
    .normalize('NFKC')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .toUpperCase()
}

function cleanSectionValue(val: unknown): string {
  const compact = cleanValue(val)
  const floorMatch = compact.match(/^(\d+)ЭТАЖ$/)
  if (floorMatch) return `${floorMatch[1]} этаж`
  return compact
}

function parseQuantity(val: unknown): number {
  if (typeof val === 'number') return val
  const prepared = String(val ?? '')
    .replace(/[\s\u00A0]/g, '')
    .replace(',', '.')
  return prepared ? Number(prepared) : Number.NaN
}

function parseShipmentRows(file: FileData, map: ColumnMap): ShipmentRow[] {
  return file.rows
    .map((row) => ({
      article: cleanValue(row[map.article]),
      quantity: parseQuantity(row[map.quantity]),
    }))
    .filter((r) => r.article && Number.isFinite(r.quantity) && r.quantity > 0)
}

function parseWarehouseRows(file: FileData, map: ColumnMap): WarehouseRow[] {
  return file.rows
    .map((row) => ({
      article: cleanValue(row[map.article]),
      box: cleanValue(row[map.box || '']),
      section: cleanSectionValue(row[map.section || '']) || '—',
      quantity: parseQuantity(row[map.quantity]),
    }))
    .filter((r) => r.article && r.box && Number.isFinite(r.quantity) && r.quantity > 0)
}

export const useJarvisStore = create<JarvisState>((set, get) => ({
  // Files
  shipmentFile: null,
  setShipmentFile: (file) => set({ shipmentFile: file, results: [], hasRun: false }),

  warehouseFile: null,
  setWarehouseFile: (file) => set({ warehouseFile: file, results: [], hasRun: false }),

  // Column maps
  shipmentColumns: null,
  setShipmentColumns: (cols) => set({ shipmentColumns: cols, results: [], hasRun: false }),

  warehouseColumns: null,
  setWarehouseColumns: (cols) => set({ warehouseColumns: cols, results: [], hasRun: false }),

  // Parsed
  shipments: [],
  warehouse: [],

  // Results
  results: [],
  hasRun: false,

  runMatch: () => {
    const { shipmentFile, warehouseFile, shipmentColumns, warehouseColumns } = get()

    if (!shipmentFile || !warehouseFile || !shipmentColumns || !warehouseColumns) return

    const shipments = parseShipmentRows(shipmentFile, shipmentColumns)
    const warehouse = parseWarehouseRows(warehouseFile, warehouseColumns)
    const results = matchShipments(shipments, warehouse)

    set({ shipments, warehouse, results, hasRun: true })
  },

  reset: () =>
    set({
      shipmentFile: null,
      warehouseFile: null,
      shipmentColumns: null,
      warehouseColumns: null,
      shipments: [],
      warehouse: [],
      results: [],
      hasRun: false,
    }),
}))
