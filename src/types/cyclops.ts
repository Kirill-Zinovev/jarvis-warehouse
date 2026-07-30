/** Item extracted from a photo by VLM */
export interface PhotoItem {
  /** Article code — primary matching key (e.g. "JB0010.A0224") */
  article: string
  /** Total quantity picked (WB + Ozon already summed) */
  quantity: number
  /** Box name — secondary matching key (e.g. "1Д45", "6ФА") */
  box?: string
}

/** Result of analyzing a single photo */
export interface PhotoAnalysis {
  fileName: string
  items: PhotoItem[]
  error?: string
}

/** Row from the uploaded inventory Excel */
export interface InventoryRow {
  article: string
  quantity: number
  box?: string
}

/** Updated inventory row after subtraction */
export interface UpdatedRow {
  article: string
  quantity: number
  box?: string
  originalQuantity: number
  picked: number
  status: 'unchanged' | 'reduced' | 'picked_up'
}

/** File data for inventory Excel */
export interface InventoryFileData {
  name: string
  rows: Record<string, unknown>[]
  columns: string[]
}

/**
 * Extract box identifier from raw text.
 * Strips everything after the first comma or "—" dash.
 *
 * E.g. "1Д45, 1 этаж — удалено 1 шт" → "1Д45"
 *      "6ФА" → "6ФА"
 *      "1ЕГ, 2 этаж — удалено 0 шт" → "1ЕГ"
 */
export function extractBoxName(raw: string): string {
  if (!raw) return ''
  const commaIdx = raw.indexOf(',')
  if (commaIdx > 0) {
    return raw.slice(0, commaIdx).trim()
  }
  const dashIdx = raw.indexOf('—')
  if (dashIdx > 0) {
    return raw.slice(0, dashIdx).trim()
  }
  return raw.trim()
}
