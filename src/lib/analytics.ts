import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { StockRecord } from '@/types/stock'

export interface TrendResult {
  slope: number
  intercept: number
  r2: number
  forecast7d: number | null
  forecastRange: { min: number; max: number } | null
  daysToZero: number | null
}

export interface AnomalyResult {
  index: number
  dateISO: string
  displayDate: string
  quantity: number
  expected: number
  deviation: number
  zScore: number
}

export interface AnalyticsResult {
  initialStock: number | null
  currentStock: number | null
  changeAbsolute: number | null
  changePercent: number | null
  dailyAverage: number | null
  coefficientOfVariation: number | null
  trend: TrendResult
  anomalies: AnomalyResult[]
}

export function computeAnalytics(records: StockRecord[]): AnalyticsResult {
  if (records.length === 0) {
    return {
      initialStock: null,
      currentStock: null,
      changeAbsolute: null,
      changePercent: null,
      dailyAverage: null,
      coefficientOfVariation: null,
      trend: { slope: 0, intercept: 0, r2: 0, forecast7d: null, forecastRange: null, daysToZero: null },
      anomalies: [],
    }
  }

  const sorted = [...records].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  const quantities = sorted.map((r) => r.quantity)

  const initialStock = quantities[0]
  const currentStock = quantities[quantities.length - 1]
  const changeAbsolute = currentStock - initialStock
  const changePercent = initialStock !== 0 ? (changeAbsolute / initialStock) * 100 : null

  const dailyChanges: number[] = []
  for (let i = 1; i < quantities.length; i++) {
    dailyChanges.push(quantities[i - 1] - quantities[i])
  }
  const dailyAverage = dailyChanges.length > 0 ? dailyChanges.reduce((s, v) => s + v, 0) / dailyChanges.length : null

  const mean = quantities.reduce((s, v) => s + v, 0) / quantities.length
  const variance = quantities.reduce((s, v) => s + (v - mean) ** 2, 0) / quantities.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = mean !== 0 ? (stdDev / mean) * 100 : null

  // Trend (linear regression)
  const trend = computeTrend(sorted)

  // Anomalies (z-score method)
  const anomalies = computeAnomalies(sorted, mean, stdDev)

  return {
    initialStock,
    currentStock,
    changeAbsolute,
    changePercent,
    dailyAverage,
    coefficientOfVariation,
    trend,
    anomalies,
  }
}

function computeTrend(sorted: StockRecord[]): TrendResult {
  const n = sorted.length
  if (n < 2) {
    return { slope: 0, intercept: sorted[0]?.quantity ?? 0, r2: 0, forecast7d: null, forecastRange: null, daysToZero: null }
  }

  // X = days since first record
  const xValues: number[] = []
  const yValues: number[] = []
  const baseDate = new Date(sorted[0].dateISO)

  for (let i = 0; i < n; i++) {
    xValues.push(i)
    yValues.push(sorted[i].quantity)
  }

  const xMean = xValues.reduce((s, v) => s + v, 0) / n
  const yMean = yValues.reduce((s, v) => s + v, 0) / n

  let ssXY = 0
  let ssXX = 0
  for (let i = 0; i < n; i++) {
    ssXY += (xValues[i] - xMean) * (yValues[i] - yMean)
    ssXX += (xValues[i] - xMean) ** 2
  }

  const slope = ssXX !== 0 ? ssXY / ssXX : 0
  const intercept = yMean - slope * xMean

  // R-squared
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xValues[i]
    ssRes += (yValues[i] - predicted) ** 2
    ssTot += (yValues[i] - yMean) ** 2
  }
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0

  // 7-day forecast
  const forecastX = n + 6 // 6 more days after the last
  const forecast7d = intercept + slope * forecastX

  // Forecast range (approximate based on residuals std dev)
  const residualStdDev = Math.sqrt(ssRes / Math.max(n - 2, 1))
  const forecastRange = {
    min: Math.max(0, forecast7d - 1.96 * residualStdDev),
    max: forecast7d + 1.96 * residualStdDev,
  }

  // Days to zero
  let daysToZero: number | null = null
  if (slope < 0) {
    const lastX = n - 1
    const lastY = yValues[n - 1]
    const daysUntilZero = lastY > 0 ? -lastY / slope : 0
    daysToZero = Math.max(0, daysUntilZero)
  }

  return {
    slope,
    intercept,
    r2,
    forecast7d: Math.max(0, forecast7d),
    forecastRange,
    daysToZero,
  }
}

function computeAnomalies(
  sorted: StockRecord[],
  mean: number,
  stdDev: number
): AnomalyResult[] {
  if (sorted.length < 3 || stdDev === 0) return []

  const anomalies: AnomalyResult[] = []
  // Use a rolling window approach: compare each point against mean ± 1.5*stdDev
  const zThreshold = 1.5

  for (let i = 0; i < sorted.length; i++) {
    const zScore = (sorted[i].quantity - mean) / stdDev
    if (Math.abs(zScore) > zThreshold) {
      anomalies.push({
        index: i,
        dateISO: sorted[i].dateISO,
        displayDate: sorted[i].displayDate,
        quantity: sorted[i].quantity,
        expected: mean,
        deviation: sorted[i].quantity - mean,
        zScore,
      })
    }
  }

  return anomalies
}

export function computeMovingAverage(records: StockRecord[], windowSize = 7): (number | null)[] {
  if (records.length === 0) return []

  const sorted = [...records].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  const result: (number | null)[] = []

  for (let i = 0; i < sorted.length; i++) {
    if (i < windowSize - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - windowSize + 1; j <= i; j++) {
        sum += sorted[j].quantity
      }
      result.push(Math.round(sum / windowSize))
    }
  }

  return result
}

export function getChartRecords(records: StockRecord[]) {
  const sorted = [...records].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  return sorted
}

export function formatDateISO(iso: string): string {
  try {
    return format(new Date(iso), 'dd.MM.yyyy', { locale: ru })
  } catch {
    return iso
  }
}

/** Alias used by API routes */
export const formatDisplayFromISO = formatDateISO

export function getTodayISO(): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
