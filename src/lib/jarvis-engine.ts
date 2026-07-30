import type { ShipmentRow, WarehouseRow, MatchResult } from '@/types/jarvis'

/**
 * Aggressively normalize string for deduplication.
 * - NFKC normalization (handles composed/decomposed Unicode, full/half-width)
 * - Remove ALL whitespace, zero-width chars, non-breaking spaces
 * - Uppercase for case-insensitive matching
 */
function normalize(str: string): string {
  return String(str)
    .normalize('NFKC')                           // Unicode normalization
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')     // strip all whitespace + zero-width
    .toUpperCase()
}

/**
 * Aggregate shipment rows: sum quantities for identical articles.
 */
function aggregateShipments(shipments: ShipmentRow[]): ShipmentRow[] {
  const map = new Map<string, ShipmentRow>()
  for (const s of shipments) {
    const key = normalize(s.article)
    const existing = map.get(key)
    if (existing) {
      existing.quantity += s.quantity
    } else {
      map.set(key, { ...s })
    }
  }
  return Array.from(map.values())
}

/**
 * Aggregate warehouse rows: sum quantities for identical (article, box) pairs.
 */
function aggregateWarehouse(warehouse: WarehouseRow[]): WarehouseRow[] {
  const map = new Map<string, WarehouseRow>()
  for (const w of warehouse) {
    const key = `${normalize(w.article)}||${normalize(w.box)}`
    const existing = map.get(key)
    if (existing) {
      existing.quantity += w.quantity
    } else {
      map.set(key, { ...w })
    }
  }
  return Array.from(map.values())
}

/**
 * Aggregate match results: sum available quantities for identical (article, box) pairs.
 */
function aggregateResults(results: MatchResult[]): MatchResult[] {
  const map = new Map<string, MatchResult>()
  for (const r of results) {
    const key = `${normalize(r.article)}||${normalize(r.box)}`
    const existing = map.get(key)
    if (existing) {
      existing.available += r.available
      existing.allocated += r.allocated
      existing.shortage = Math.max(existing.shortage, r.shortage)
      existing.remainingNeed = Math.max(existing.remainingNeed, r.remainingNeed)
    } else {
      map.set(key, { ...r })
    }
  }
  return Array.from(map.values())
}

/**
 * Match shipment articles against warehouse reference.
 * All duplicate rows are aggregated before matching.
 */
export function matchShipments(
  shipments: ShipmentRow[],
  warehouse: WarehouseRow[]
): MatchResult[] {
  // Step 1: aggregate both inputs — sum duplicates
  const aggShipments = aggregateShipments(shipments)
  const aggWarehouse = aggregateWarehouse(warehouse)

  // Step 2: group warehouse by article
  const warehouseMap = new Map<string, WarehouseRow[]>()
  for (const w of aggWarehouse) {
    const key = normalize(w.article)
    const existing = warehouseMap.get(key) || []
    existing.push(w)
    warehouseMap.set(key, existing)
  }

  // Step 3: match each shipment article against warehouse
  let results: MatchResult[] = []

  for (const s of aggShipments) {
    const key = normalize(s.article)
    const warehouseEntries = warehouseMap.get(key)

    if (!warehouseEntries || warehouseEntries.length === 0) {
      results.push({
        article: s.article,
        needed: s.quantity,
        box: '—',
        available: 0,
        status: 'not_found',
        shortage: s.quantity,
        allocated: 0,
        remainingNeed: s.quantity,
      })
      continue
    }

    // Allocate demand FIFO across boxes. A shortage belongs to the article,
    // not to every box row, so it is reported only once on the final row.
    let remainingNeed = s.quantity
    for (let index = 0; index < warehouseEntries.length; index++) {
      const w = warehouseEntries[index]
      const allocated = Math.min(remainingNeed, w.quantity)
      remainingNeed -= allocated
      const isLast = index === warehouseEntries.length - 1
      const shortage = isLast ? remainingNeed : 0
      const status: MatchResult['status'] = shortage > 0 ? 'shortage' : 'enough'

      results.push({
        article: s.article,
        needed: s.quantity,
        box: w.box,
        available: w.quantity,
        status,
        shortage,
        allocated,
        remainingNeed: isLast ? remainingNeed : 0,
      })
    }
  }

  // Step 4: final safety — aggregate any remaining result duplicates
  results = aggregateResults(results)

  return results
}

/**
 * Get summary statistics from match results.
 */
export function getMatchSummary(results: MatchResult[]) {
  const articles = new Set(results.map((r) => r.article))
  const found = new Set(results.filter((r) => r.status !== 'not_found').map((r) => r.article))
  const notFound = new Set(results.filter((r) => r.status === 'not_found').map((r) => r.article))
  const withShortage = new Set(results.filter((r) => r.status === 'shortage').map((r) => r.article))

  return {
    totalArticles: articles.size,
    foundArticles: found.size,
    notFoundArticles: notFound.size,
    shortageArticles: withShortage.size,
    totalRows: results.length,
  }
}
