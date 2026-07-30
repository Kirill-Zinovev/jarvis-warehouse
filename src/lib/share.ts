import LZString from 'lz-string'

interface SharePayload {
  f: string       // floor
  d: {            // data records
    a: string     // dateISO
    q: number     // quantity
  }[]
}

/**
 * Encode floor records into a compressed URL-safe string
 */
export function encodeShareData(floor: string, records: { dateISO: string; quantity: number }[]): string {
  const payload: SharePayload = {
    f: floor,
    d: records.map(r => ({ a: r.dateISO, q: r.quantity })),
  }
  const json = JSON.stringify(payload)
  return LZString.compressToEncodedURIComponent(json)
}

/**
 * Decode a shared URL string back into floor + records
 */
export function decodeShareData(encoded: string): { floor: string; records: { dateISO: string; quantity: number }[] } | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const payload: SharePayload = JSON.parse(json)
    if (!payload.f || !Array.isArray(payload.d)) return null
    return {
      floor: payload.f,
      records: payload.d.map(r => ({ dateISO: r.a, quantity: r.q })),
    }
  } catch {
    return null
  }
}

/**
 * Build a full share URL from encoded data
 */
export function buildShareURL(encoded: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return `${base}?d=${encoded}`
}
