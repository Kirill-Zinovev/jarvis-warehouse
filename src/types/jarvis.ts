/** Raw row from an uploaded Excel file */
export interface RawRow {
  [key: string]: string | number
}

/** Parsed shipment row (from File 1) */
export interface ShipmentRow {
  article: string
  quantity: number
}

/** Parsed warehouse reference row (from File 2) */
export interface WarehouseRow {
  article: string
  box: string
  quantity: number
}

/** Matched result row */
export interface MatchResult {
  article: string
  needed: number
  box: string
  available: number
  status: 'enough' | 'shortage' | 'not_found'
  shortage: number
  /** Quantity from this box allocated to the shipment. */
  allocated: number
  /** Uncovered quantity after this row; non-zero only on the final shortage row. */
  remainingNeed: number
}

/** File upload state */
export interface FileData {
  name: string
  rows: RawRow[]
  columns: string[]
  mapped: boolean
}

/** Column mapping for a file */
export interface ColumnMap {
  article: string
  quantity: string
  box?: string // only for warehouse file
}
