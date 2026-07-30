'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useWarehouseStore } from '@/store/warehouse-store'

export function ControlsBar() {
  const criticalThreshold = useWarehouseStore((s) => s.criticalThreshold)
  const setCriticalThreshold = useWarehouseStore((s) => s.setCriticalThreshold)
  const showMovingAvg = useWarehouseStore((s) => s.showMovingAvg)
  const setShowMovingAvg = useWarehouseStore((s) => s.setShowMovingAvg)

  useEffect(() => {
    localStorage.setItem('criticalThreshold', String(criticalThreshold))
  }, [criticalThreshold])

  return (
    <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-3 flex-1 min-w-[220px]">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <Label className="text-sm font-medium whitespace-nowrap">
          Критический порог:
        </Label>
        <Slider
          value={[criticalThreshold]}
          onValueChange={([val]) => setCriticalThreshold(val)}
          min={0}
          max={20000}
          step={100}
          className="flex-1"
        />
        <span className="text-sm font-bold min-w-[4rem] text-right tabular-nums">
          {criticalThreshold.toLocaleString('ru-RU')} шт
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="moving-avg-toggle"
          checked={showMovingAvg}
          onCheckedChange={setShowMovingAvg}
        />
        <Label htmlFor="moving-avg-toggle" className="text-sm cursor-pointer select-none">
          Скользящее среднее (7 дн)
        </Label>
      </div>
    </div>
  )
}
