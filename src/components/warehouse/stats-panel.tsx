'use client'

import { useMemo } from 'react'
import { useWarehouseStore } from '@/store/warehouse-store'
import { computeAnalytics } from '@/lib/analytics'
import type { StockRecord } from '@/types/stock'

function StatCard({
  label,
  value,
  subtitle,
  colorClass = '',
}: {
  label: string
  value: string
  subtitle?: string
  colorClass?: string
}) {
  return (
    <div className="rounded-xl p-3 bg-white/50 dark:bg-card/50 border border-border/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold ${colorClass}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

export function StatsPanel() {
  const records = useWarehouseStore((s) => s.records)
  const currentFloor = useWarehouseStore((s) => s.currentFloor)

  const floorRecords = useMemo(
    () => [...records]
      .filter((r) => r.floor === currentFloor)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [records, currentFloor]
  )

  const stats = useMemo(() => {
    if (floorRecords.length === 0) return null
    return computeAnalytics(floorRecords)
  }, [floorRecords])

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl p-3 bg-white/50 dark:bg-card/50 border border-border/50">
            <div className="h-3 w-16 bg-muted rounded mb-2" />
            <div className="h-6 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    )
  }

  const {
    initialStock, currentStock, changeAbsolute, changePercent,
    dailyAverage, coefficientOfVariation, trend, anomalies,
  } = stats

  const changeColor = changeAbsolute !== null && changeAbsolute > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : changeAbsolute !== null && changeAbsolute < 0
      ? 'text-red-600 dark:text-red-400'
      : ''

  const dailyColor = dailyAverage !== null && dailyAverage > 0
    ? 'text-red-600 dark:text-red-400'
    : dailyAverage !== null && dailyAverage < 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : ''

  let cvLabel = ''
  let cvColor = ''
  if (coefficientOfVariation !== null) {
    if (coefficientOfVariation < 15) { cvLabel = 'стабильно'; cvColor = 'text-emerald-600 dark:text-emerald-400' }
    else if (coefficientOfVariation < 35) { cvLabel = 'средне'; cvColor = 'text-amber-600 dark:text-amber-400' }
    else { cvLabel = 'нестабильно'; cvColor = 'text-red-600 dark:text-red-400' }
  }

  const forecastLabel = trend.daysToZero !== null
    ? `${Math.round(trend.daysToZero)} дн`
    : trend.slope >= 0
      ? 'Рост'
      : '—'

  const rangeLabel = trend.forecastRange
    ? `${Math.round(trend.forecastRange.min)}–${Math.round(trend.forecastRange.max)}`
    : '—'

  const sorted = floorRecords

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="Начальный остаток"
        value={initialStock !== null ? initialStock.toLocaleString('ru-RU') : '—'}
        subtitle={sorted[0]?.displayDate}
      />
      <StatCard
        label="Текущий остаток"
        value={currentStock !== null ? currentStock.toLocaleString('ru-RU') : '—'}
        subtitle={sorted[sorted.length - 1]?.displayDate}
      />
      <StatCard
        label="Изменение"
        value={
          changeAbsolute !== null
            ? `${changeAbsolute > 0 ? '+' : ''}${changeAbsolute.toLocaleString('ru-RU')}`
            : '—'
        }
        subtitle={
          changePercent !== null
            ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%`
            : undefined
        }
        colorClass={changeColor}
      />
      <StatCard
        label="Ср. дневное"
        value={
          dailyAverage !== null
            ? `${dailyAverage > 0 ? '−' : '+'}${Math.abs(dailyAverage).toFixed(1)}`
            : '—'
        }
        subtitle="шт/день"
        colorClass={dailyColor}
      />
      <StatCard
        label="Коэф. вариации"
        value={coefficientOfVariation !== null ? `${coefficientOfVariation.toFixed(1)}%` : '—'}
        subtitle={cvLabel || undefined}
        colorClass={cvColor}
      />
      <StatCard
        label="Аномалии"
        value={String(anomalies.length)}
        subtitle={anomalies.length > 0 ? 'z-score > 1.5' : 'нет'}
        colorClass={anomalies.length > 0 ? 'text-amber-600 dark:text-amber-400' : ''}
      />
      <StatCard
        label="Прогноз"
        value={forecastLabel}
        subtitle="до нуля"
        colorClass={trend.slope >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
      />
      <StatCard
        label="Диапазон прогноза"
        value={rangeLabel}
        subtitle="шт через 7 дней"
      />
    </div>
  )
}
