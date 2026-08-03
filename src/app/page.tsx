'use client'

import { useState } from 'react'
import { Bot, Info, PackageMinus } from 'lucide-react'
import { JarvisPage } from '@/components/jarvis/jarvis-page'
import { PashaPage } from '@/components/pasha/pasha-page'
import { cn } from '@/lib/utils'

export default function Home() {
  const [protocol, setProtocol] = useState<'jarvis' | 'pasha'>('jarvis')

  return (
    <main className={cn('min-h-screen', protocol === 'pasha' ? 'bg-white' : 'bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.10),transparent_35%)]')}>
      <div className={cn('mx-auto w-full', protocol === 'pasha' ? '' : 'max-w-[1500px] p-4 md:p-6 lg:p-8')}>
        <div className={cn('overflow-hidden', protocol === 'pasha' ? 'bg-white' : 'glass-strong rounded-[2rem] shadow-2xl shadow-rose-950/10')}>
          <div className={cn('border-b', protocol === 'pasha' ? 'border-rose-100 bg-white px-5 py-4 md:px-8' : 'bg-background/70 px-4 py-3 md:px-6')}>
            <div className="mx-auto flex max-w-[1420px] items-center justify-between gap-4">
              <div className="flex items-center gap-3" role="tablist" aria-label="Протоколы склада">
                <button type="button" role="tab" aria-selected={protocol === 'jarvis'} onClick={() => setProtocol('jarvis')} className={cn('flex items-center gap-2 text-sm font-semibold transition-colors', protocol === 'pasha' ? 'text-rose-500' : protocol === 'jarvis' ? 'rounded-xl bg-primary px-3 py-2 text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {protocol === 'pasha' ? <img src="/jarvis-logo.svg" alt="" className="h-7 w-7" /> : <Bot className="h-4 w-4" />}<span className={protocol === 'pasha' ? 'text-2xl tracking-tight' : ''}>Jarvis</span>
                </button>
                {protocol === 'pasha' && <><span className="h-7 w-px bg-rose-200" /><button type="button" role="tab" aria-selected onClick={() => setProtocol('pasha')} className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900"><span>ПАША</span><span className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-500">Новый протокол</span></button></>}
                {protocol !== 'pasha' && <button type="button" role="tab" aria-selected={false} onClick={() => setProtocol('pasha')} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><PackageMinus className="h-4 w-4" />ПАША</button>}
              </div>
              {protocol === 'pasha' && <button type="button" className="flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-50"><Info className="h-4 w-4" />О протоколе ПАША</button>}
            </div>
          </div>
          <div className={cn(protocol === 'pasha' ? '' : 'p-4 md:p-6')}>
            {protocol === 'jarvis' ? <JarvisPage /> : <PashaPage />}
          </div>
        </div>
      </div>
    </main>
  )
}
