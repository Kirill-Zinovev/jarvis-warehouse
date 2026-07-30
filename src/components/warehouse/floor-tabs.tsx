'use client'

import { Layers, Building2 } from 'lucide-react'
import { useWarehouseStore } from '@/store/warehouse-store'
import { FLOOR_LABELS } from '@/types/stock'
import type { FloorId } from '@/types/stock'
import { cn } from '@/lib/utils'

export function FloorTabs() {
  const currentFloor = useWarehouseStore((s) => s.currentFloor)
  const setCurrentFloor = useWarehouseStore((s) => s.setCurrentFloor)
  const records = useWarehouseStore((s) => s.records)

  const floors: FloorId[] = ['1', '2']

  return (
    <div className="flex items-center gap-2">
      <Layers className="h-4 w-4 text-muted-foreground hidden sm:block" />
      <div className="flex rounded-xl bg-muted/60 p-1 gap-1">
        {floors.map((floor) => {
          const isActive = currentFloor === floor
          const floorCount = records.filter((r) => r.floor === floor).length

          return (
            <button
              key={floor}
              onClick={() => setCurrentFloor(floor)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">{FLOOR_LABELS[floor]}</span>
              <span className="sm:hidden">{floor} эт.</span>
              {floorCount > 0 && (
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {floorCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
