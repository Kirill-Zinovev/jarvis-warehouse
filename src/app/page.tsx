'use client'

import { useState } from 'react'
import { Bot, PackageMinus } from 'lucide-react'
import { JarvisPage } from '@/components/jarvis/jarvis-page'
import { PashaPage } from '@/components/pasha/pasha-page'
import { cn } from '@/lib/utils'

export default function Home() {
  const [protocol, setProtocol] = useState<'jarvis' | 'pasha'>('jarvis')

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.10),transparent_35%)]">
      <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6 lg:p-8">
        <div className="glass-strong overflow-hidden rounded-[2rem] shadow-2xl shadow-rose-950/10">
          <div className="border-b bg-background/70 px-4 py-3 md:px-6">
            <div className="flex items-center gap-2" role="tablist" aria-label="Протоколы склада">
              <button type="button" role="tab" aria-selected={protocol === 'jarvis'} onClick={() => setProtocol('jarvis')} className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors', protocol === 'jarvis' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Bot className="h-4 w-4" />Jarvis
              </button>
              <button type="button" role="tab" aria-selected={protocol === 'pasha'} onClick={() => setProtocol('pasha')} className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors', protocol === 'pasha' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <PackageMinus className="h-4 w-4" />ПАША
              </button>
            </div>
          </div>
          <div className="p-4 md:p-6">
            {protocol === 'jarvis' ? <JarvisPage /> : <PashaPage />}
          </div>
        </div>
      </div>
    </main>
  )
}
