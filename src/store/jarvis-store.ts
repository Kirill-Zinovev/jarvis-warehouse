import { create } from 'zustand'
import type {
  FileData,
  ColumnMap,
  ShipmentRow,
  WarehouseRow,
  MatchResult,
  DirectionMatchResult,
  ShipmentDirection,
} from '@/types/jarvis'
import { matchShipmentDirections, matchShipments } from '@/lib/jarvis-engine'

export type JarvisWorkflowMode = 'single' | 'directions'

interface JarvisState {
  workflowMode: JarvisWorkflowMode
  setWorkflowMode: (mode: JarvisWorkflowMode) => void

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

  // Shipment files processed in upload order against shared stock.
  directions: ShipmentDirection[]
  addDirections: (directions: ShipmentDirection[]) => void
  setDirectionName: (id: string, name: string) => void
  setDirectionColumns: (id: string, columns: ColumnMap) => void
  removeDirection: (id: string) => void

  // Parsed data
  shipments: ShipmentRow[]
  warehouse: WarehouseRow[]

  // Results
  results: MatchResult[]
  hasRun: boolean
  directionResults: DirectionMatchResult[]
  hasDirectionRun: boolean

  // Actions
  runMatch: () => void
  runDirectionMatch: () => void
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
  workflowMode: 'single',
  setWorkflowMode: (mode) => set({ workflowMode: mode }),

  // Files
  shipmentFile: null,
  setShipmentFile: (file) => set({ shipmentFile: file, results: [], hasRun: false }),

  warehouseFile: null,
  setWarehouseFile: (file) => set({ warehouseFile: file, results: [], hasRun: false, directionResults: [], hasDirectionRun: false }),

  // Column maps
  shipmentColumns: null,
  setShipmentColumns: (cols) => set({ shipmentColumns: cols, results: [], hasRun: false }),

  warehouseColumns: null,
  setWarehouseColumns: (cols) => set({ warehouseColumns: cols, results: [], hasRun: false, directionResults: [], hasDirectionRun: false }),

  directions: [],
  addDirections: (newDirections) => set((state) => ({
    directions: [...state.directions, ...newDirections],
    directionResults: [],
    hasDirectionRun: false,
  })),
  setDirectionName: (id, name) => set((state) => ({
    directions: state.directions.map((direction) => direction.id === id ? { ...direction, name } : direction),
    directionResults: [],
    hasDirectionRun: false,
  })),
  setDirectionColumns: (id, columns) => set((state) => ({
    directions: state.directions.map((direction) => direction.id === id ? { ...direction, columns } : direction),
    directionResults: [],
    hasDirectionRun: false,
  })),
  removeDirection: (id) => set((state) => ({
    directions: state.directions.filter((direction) => direction.id !== id),
    directionResults: [],
    hasDirectionRun: false,
  })),

  // Parsed
  shipments: [],
  warehouse: [],

  // Results
  results: [],
  hasRun: false,
  directionResults: [],
  hasDirectionRun: false,

  runMatch: () => {
    const { shipmentFile, warehouseFile, shipmentColumns, warehouseColumns } = get()

    if (!shipmentFile || !warehouseFile || !shipmentColumns || !warehouseColumns) return

    const shipments = parseShipmentRows(shipmentFile, shipmentColumns)
    const warehouse = parseWarehouseRows(warehouseFile, warehouseColumns)
    const results = matchShipments(shipments, warehouse)

    set({ shipments, warehouse, results, hasRun: true })
  },

  runDirectionMatch: () => {
    const { directions, warehouseFile, warehouseColumns } = get()
    if (!directions.length || directions.some((direction) => !direction.name.trim() || !direction.columns.article || !direction.columns.quantity) || !warehouseFile || !warehouseColumns?.article || !warehouseColumns.box || !warehouseColumns.quantity) return

    const warehouse = parseWarehouseRows(warehouseFile, warehouseColumns)
    const directionResults = matchShipmentDirections(
      directions.map((direction) => ({
        id: direction.id,
        name: direction.name,
        shipments: parseShipmentRows(direction.file, direction.columns),
      })),
      warehouse
    )

    set({ directionResults, hasDirectionRun: true })
  },

  reset: () =>
    set({
      shipmentFile: null,
      warehouseFile: null,
      shipmentColumns: null,
      warehouseColumns: null,
      directions: [],
      shipments: [],
      warehouse: [],
      results: [],
      hasRun: false,
      directionResults: [],
      hasDirectionRun: false,
    }),
}))
