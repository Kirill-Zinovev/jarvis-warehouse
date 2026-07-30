'use client'

import { Package, Sun, Moon, Building2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useWarehouseStore } from '@/store/warehouse-store'
import { FLOOR_LABELS } from '@/types/stock'
import type { FloorId } from '@/types/stock'

export function AppHeader() {
  const { theme, setTheme } = useTheme()
  const currentFloor = useWarehouseStore((s) => s.currentFloor)

  return (
    <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-t-2xl p-5 md:p-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Package className="h-7 w-7 md:h-8 md:w-8" />
        <div>
          <h1 className="text-lg md:text-2xl font-bold tracking-tight">
            Складской аналитик · ЭЛИТ
          </h1>
          <p className="text-xs md:text-sm opacity-80 flex items-center gap-1.5 mt-0.5">
            <Building2 className="h-3.5 w-3.5" />
            {FLOOR_LABELS[currentFloor as FloorId]}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="text-primary-foreground hover:bg-white/20 transition-colors"
        aria-label="Переключить тему"
      >
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>
    </div>
  )
}
