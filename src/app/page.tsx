'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WarehouseProvider } from '@/components/warehouse/warehouse-provider'
import { AppHeader } from '@/components/warehouse/app-header'
import { FloorTabs } from '@/components/warehouse/floor-tabs'
import { StockForm } from '@/components/warehouse/stock-form'
import { ControlsBar } from '@/components/warehouse/controls-bar'
import { ActionBar } from '@/components/warehouse/action-bar'
import { StockChart } from '@/components/warehouse/stock-chart'
import { StatsPanel } from '@/components/warehouse/stats-panel'
import { StockTable } from '@/components/warehouse/stock-table'
import { SnapshotSidebar } from '@/components/warehouse/snapshot-sidebar'
import { JarvisPage } from '@/components/jarvis/jarvis-page'
import { CyclopsPage } from '@/components/cyclops/cyclops-page'
import { useWarehouseStore } from '@/store/warehouse-store'
import { cn } from '@/lib/utils'
import { Package, Cpu, Camera } from 'lucide-react'

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
}

function MainContent() {
  const currentFloor = useWarehouseStore((s) => s.currentFloor)

  return (
    <motion.div
      key={currentFloor}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-5"
    >
      <StockForm />
      <ControlsBar />
      <ActionBar />
      <StockChart />
      <StatsPanel />
      <StockTable />
      <p className="text-xs text-center text-muted-foreground mt-4 pb-2">
        Красная строка — ниже порога. Жёлтая — аномалия. Оранжевая линия — прогноз на 7 дней.
      </p>
    </motion.div>
  )
}

function WarehouseView() {
  return (
    <div className="flex flex-col lg:flex-row gap-5">
      <div className="flex-[3] min-w-0">
        <motion.div
          className="glass-strong rounded-2xl shadow-lg shadow-black/5 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <AppHeader />
          <div className="p-4 md:p-6 space-y-5">
            <motion.div {...fadeUp} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}>
              <FloorTabs />
            </motion.div>
            <MainContent />
          </div>
        </motion.div>
      </div>
      <motion.div
        className="lg:flex-1 lg:min-w-[280px]"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
      >
        <SnapshotSidebar />
      </motion.div>
    </div>
  )
}

function JarvisView() {
  return (
    <motion.div
      className="glass-strong rounded-2xl shadow-lg shadow-black/5 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="p-4 md:p-6">
        <JarvisPage />
      </div>
    </motion.div>
  )
}

function CyclopsView() {
  return (
    <motion.div
      className="glass-strong rounded-2xl shadow-lg shadow-black/5 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="p-4 md:p-6">
        <CyclopsPage />
      </div>
    </motion.div>
  )
}

type TabId = 'warehouse' | 'jarvis' | 'cyclops'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'warehouse', label: 'Складской аналитик', icon: Package },
  { id: 'jarvis', label: 'Джарвис', icon: Cpu },
  { id: 'cyclops', label: 'Циклоп', icon: Camera },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('warehouse')

  return (
    <WarehouseProvider>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50/80 via-background to-green-50/60 dark:from-background dark:via-background dark:to-background">
        <main className="flex-1 max-w-[1500px] w-full mx-auto p-4 md:p-6">
          {/* Top navigation */}
          <motion.div
            className="mb-5"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex rounded-xl bg-muted/60 p-1 gap-1 w-fit flex-wrap">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'warehouse' && (
              <motion.div key="warehouse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <WarehouseView />
              </motion.div>
            )}
            {activeTab === 'jarvis' && (
              <motion.div key="jarvis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <JarvisView />
              </motion.div>
            )}
            {activeTab === 'cyclops' && (
              <motion.div key="cyclops" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <CyclopsView />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </WarehouseProvider>
  )
}
