'use client'

import { useMemo } from 'react'
import { useWarehouseStore } from '@/store/warehouse-store'
import { computeMovingAverage, computeAnalytics } from '@/lib/analytics'
import { PackageOpen } from 'lucide-react'

interface ChartPoint {
  displayDate: string
  dateISO: string
  quantity: number
  movingAvg?: number | null
  forecast?: number | null
}

export function StockChart() {
  const records = useWarehouseStore((s) => s.records)
  const currentFloor = useWarehouseStore((s) => s.currentFloor)
  const showMovingAvg = useWarehouseStore((s) => s.showMovingAvg)
  const criticalThreshold = useWarehouseStore((s) => s.criticalThreshold)

  const floorRecords = useMemo(
    () => [...records]
      .filter((r) => r.floor === currentFloor)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [records, currentFloor]
  )

  const chartData = useMemo<ChartPoint[]>(() => {
    if (floorRecords.length === 0) return []

    const analytics = computeAnalytics(floorRecords)
    const { trend } = analytics
    const ma = showMovingAvg ? computeMovingAverage(floorRecords, 7) : []

    const points: ChartPoint[] = floorRecords.map((r, i) => ({
      displayDate: r.displayDate,
      dateISO: r.dateISO,
      quantity: r.quantity,
      movingAvg: showMovingAvg ? ma[i] ?? null : null,
      forecast: null,
    }))

    // 7-day forecast
    if (floorRecords.length >= 2 && trend.forecast7d !== null) {
      const lastDate = new Date(floorRecords[floorRecords.length - 1].dateISO + 'T00:00:00')
      for (let d = 1; d <= 7; d++) {
        const forecastDate = new Date(lastDate)
        forecastDate.setDate(forecastDate.getDate() + d)
        const iso = forecastDate.toISOString().slice(0, 10)
        const x = floorRecords.length + d - 1
        const day = String(forecastDate.getDate()).padStart(2, '0')
        const month = String(forecastDate.getMonth() + 1).padStart(2, '0')
        const val = Math.round(Math.max(0, trend.intercept + trend.slope * x))
        points.push({
          displayDate: `${day}.${month}`,
          dateISO: iso,
          quantity: 0,
          movingAvg: null,
          forecast: val,
        })
      }
    }

    return points
  }, [floorRecords, showMovingAvg])

  if (floorRecords.length === 0) {
    return (
      <div className="glass rounded-xl p-8 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <PackageOpen className="h-10 w-10" />
        <p className="text-sm">Добавьте данные для отображения графика</p>
      </div>
    )
  }

  return (
    <div className="glass rounded-xl p-4">
      {/* Recharts via dynamic import — we inline it here */}
      <ChartCanvas
        data={chartData}
        criticalThreshold={criticalThreshold}
      />
    </div>
  )
}

// Separate chart component that imports recharts
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

function ChartCanvas({ data, criticalThreshold }: { data: ChartPoint[]; criticalThreshold: number }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tickFormatter={(v: number) => v.toLocaleString('ru-RU')} tick={{ fontSize: 11 }} tickLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--popover)',
            color: 'var(--popover-foreground)',
            fontSize: '13px',
          }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              quantity: 'Остаток',
              movingAvg: 'Скольз. среднее',
              forecast: 'Прогноз',
            }
            return [value.toLocaleString('ru-RU'), labels[name] ?? name]
          }}
        />

        <Area
          type="monotone"
          dataKey="quantity"
          stroke="#059669"
          fill="url(#colorStock)"
          strokeWidth={2}
          dot={{ r: 3, fill: '#059669' }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />

        {data.some((p) => p.movingAvg !== null) && (
          <Line
            type="monotone"
            dataKey="movingAvg"
            stroke="#d97706"
            strokeDasharray="8 4"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        )}

        {data.some((p) => p.forecast !== null) && (
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#ea580c"
            strokeDasharray="5 5"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        )}

        <ReferenceLine
          y={criticalThreshold}
          stroke="#ef4444"
          strokeDasharray="3 3"
          label={{
            value: 'Порог',
            position: 'right',
            fill: '#ef4444',
            fontSize: 12,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
