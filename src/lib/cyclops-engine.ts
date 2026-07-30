import type { PhotoItem, InventoryRow, UpdatedRow } from '@/types/cyclops'
import { extractBoxName } from '@/types/cyclops'

/**
 * Normalize string for matching: strip whitespace, unicode normalize, uppercase.
 */
function normalize(str: string): string {
  return String(str).normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toUpperCase()
}

/**
 * Clean a box value: extract the identifier and normalize it.
 * E.g. "1Д45, 1 этаж — удалено 1 шт" → normalized "1Д45"
 */
function cleanBox(raw: string | undefined): string {
  if (!raw) return ''
  return normalize(extractBoxName(raw))
}

/**
 * Aggregate photo items: sum quantities for identical (article, box) pairs.
 */
function aggregatePhotoItems(items: PhotoItem[]): PhotoItem[] {
  const map = new Map<string, PhotoItem>()
  for (const item of items) {
    const key = `${normalize(item.article)}||${cleanBox(item.box)}`
    const existing = map.get(key)
    if (existing) {
      existing.quantity += item.quantity
    } else {
      map.set(key, { ...item })
    }
  }
  return Array.from(map.values())
}

/**
 * Aggregate inventory rows: sum quantities for identical (article, box) pairs.
 */
function aggregateInventory(rows: InventoryRow[]): InventoryRow[] {
  const map = new Map<string, InventoryRow>()
  for (const r of rows) {
    const key = `${normalize(r.article)}||${cleanBox(r.box)}`
    const existing = map.get(key)
    if (existing) {
      existing.quantity += r.quantity
    } else {
      map.set(key, { ...r })
    }
  }
  return Array.from(map.values())
}

/**
 * Subtract picked items (from photos) from inventory.
 *
 * Matching is by (article, box) pair.
 * Box names are cleaned: "1Д45, 1 этаж — удалено 1 шт" → "1Д45"
 *
 * IMPORTANT: Only subtract from the EXACT (article, box) combination.
 * No fallback to article-only matching.
 * Never subtract more than available. Capped at 0.
 */
export function subtractFromInventory(
  inventory: InventoryRow[],
  pickedItems: PhotoItem[]
): UpdatedRow[] {
  const aggInventory = aggregateInventory(inventory)
  const aggPicked = aggregatePhotoItems(pickedItems)

  const pickedMap = new Map<string, PhotoItem>()
  for (const p of aggPicked) {
    const key = `${normalize(p.article)}||${cleanBox(p.box)}`
    const existing = pickedMap.get(key)
    if (existing) {
      existing.quantity += p.quantity
    } else {
      pickedMap.set(key, { ...p })
    }
  }

  return aggInventory.map((row) => {
    const exactKey = `${normalize(row.article)}||${cleanBox(row.box)}`
    const picked = pickedMap.get(exactKey)

    if (!picked || picked.quantity === 0) {
      return {
        article: row.article,
        quantity: row.quantity,
        box: row.box,
        originalQuantity: row.quantity,
        picked: 0,
        status: 'unchanged',
      }
    }

    const remaining = Math.max(0, row.quantity - picked.quantity)

    return {
      article: row.article,
      quantity: remaining,
      box: row.box,
      originalQuantity: row.quantity,
      picked: Math.min(picked.quantity, row.quantity),
      status: remaining === 0 ? 'picked_up' : 'reduced',
    }
  })
}

/**
 * Find items that were seen in photos but NOT in inventory.
 */
export function findUnmatchedPicked(
  inventory: InventoryRow[],
  pickedItems: PhotoItem[]
): PhotoItem[] {
  const invMap = new Set<string>()
  for (const r of inventory) {
    const key = `${normalize(r.article)}||${cleanBox(r.box)}`
    invMap.add(key)
  }

  return pickedItems.filter((p) => {
    const key = `${normalize(p.article)}||${cleanBox(p.box)}`
    return !invMap.has(key)
  })
}

/**
 * Get summary statistics.
 */
export function getCyclopsSummary(results: UpdatedRow[], unmatchedCount: number) {
  const total = results.length
  const unchanged = results.filter((r) => r.status === 'unchanged').length
  const reduced = results.filter((r) => r.status === 'reduced').length
  const pickedUp = results.filter((r) => r.status === 'picked_up').length
  const totalPicked = results.reduce((sum, r) => sum + r.picked, 0)
  const totalOriginal = results.reduce((sum, r) => sum + r.originalQuantity, 0)
  const totalRemaining = results.reduce((sum, r) => sum + r.quantity, 0)

  return { total, unchanged, reduced, pickedUp, unmatchedCount, totalPicked, totalOriginal, totalRemaining }
}
