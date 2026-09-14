'use client'

import { useState } from 'react'
import { Bot, Info, PackageMinus } from 'lucide-react'
import { JarvisPage } from '@/components/jarvis/jarvis-page'
import { PashaPage } from '@/components/pasha/pasha-page'
import { cn } from '@/lib/utils'

export default function Home() {
  const [protocol, setProtocol] = useState<'jarvis' | 'pasha'>('jarvis')

  return (
    <main className="jarvis-app min-h-screen overflow-x-hidden bg-[#f7f9fc] text-[#10204a]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[216px] shrink-0 flex-col border-r border-[#dfe6ef] bg-white lg:flex">
          <div className="border-b border-[#edf1f5] px-6 pb-5 pt-6">
            <div className="flex items-center gap-3">
              <img src="/jarvis-logo.svg" alt="Jarvis" className="h-10 w-10" />
              <div>
                <p className="text-[22px] font-extrabold leading-none tracking-[-0.05em] text-[#122044]">Jarvis</p>
                <p className="mt-1 text-[11px] leading-4 text-[#71819a]">Складской учёт<br />и отгрузка</p>
              </div>
            </div>
          </div>

          <nav aria-label="Протоколы склада" className="flex-1 px-3 py-6">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#92a0b5]">Протоколы</p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                aria-current={protocol === 'jarvis' ? 'page' : undefined}
                onClick={() => setProtocol('jarvis')}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-r-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/35',
                  protocol === 'jarvis' ? 'bg-[#fff0f3] text-[#d61f45]' : 'text-[#243454] hover:bg-[#f7f9fc]'
                )}
              >
                {protocol === 'jarvis' && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-[#e11d48]" />}
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', protocol === 'jarvis' ? 'bg-white text-[#e11d48]' : 'bg-[#f3f6fa] text-[#53647e]')}>
                  <Bot className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">Jarvis</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#7a8aa2]">Подбор коробов</span>
                </span>
              </button>
              <button
                type="button"
                aria-current={protocol === 'pasha' ? 'page' : undefined}
                onClick={() => setProtocol('pasha')}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-r-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/35',
                  protocol === 'pasha' ? 'bg-[#fff0f3] text-[#d61f45]' : 'text-[#243454] hover:bg-[#f7f9fc]'
                )}
              >
                {protocol === 'pasha' && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-[#e11d48]" />}
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', protocol === 'pasha' ? 'bg-white text-[#e11d48]' : 'bg-[#f3f6fa] text-[#53647e]')}>
                  <PackageMinus className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">ПАША</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#7a8aa2]">Удаление OZ/WB</span>
                </span>
              </button>
            </div>
          </nav>

          <div className="border-t border-[#edf1f5] px-6 py-5">
            <p className="flex items-center gap-2 text-xs font-medium text-[#61718a]">
              <Info className="h-4 w-4" />
              Справка
            </p>
            <p className="mt-5 text-[10px] leading-4 text-[#a1adbd]">Jarvis · ПАША<br />рабочее пространство</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex min-h-[64px] items-center gap-4 border-b border-[#dfe6ef] bg-white px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <img src="/jarvis-logo.svg" alt="Jarvis" className="h-8 w-8" />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[#122044]">{protocol === 'jarvis' ? 'Jarvis' : 'ПАША'}</p>
                <p className="truncate text-[11px] text-[#71819a]">{protocol === 'jarvis' ? 'Подбор коробов' : 'Удаление OZ/WB'}</p>
              </div>
            </div>
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <span className="h-2 w-2 rounded-full bg-[#22b573]" />
              <span className="text-sm font-medium text-[#53647e]">Склад · Оператор</span>
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs text-[#6f7e96]">
              <span className="hidden sm:inline">14.09.2026</span>
              <span className="hidden h-5 w-px bg-[#dfe6ef] sm:inline" />
              <span className="hidden md:inline">Данные обрабатываются на устройстве</span>
            </div>
          </header>

          <nav aria-label="Протоколы склада" className="flex gap-2 overflow-x-auto border-b border-[#e8edf3] bg-white px-4 py-3 lg:hidden">
            <button type="button" onClick={() => setProtocol('jarvis')} className={cn('flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/35', protocol === 'jarvis' ? 'bg-[#fff0f3] text-[#d61f45]' : 'text-[#5c6c85] hover:bg-[#f7f9fc]')}>
              <Bot className="h-4 w-4" /> Jarvis · Подбор коробов
            </button>
            <button type="button" onClick={() => setProtocol('pasha')} className={cn('flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e11d48]/35', protocol === 'pasha' ? 'bg-[#fff0f3] text-[#d61f45]' : 'text-[#5c6c85] hover:bg-[#f7f9fc]')}>
              <PackageMinus className="h-4 w-4" /> ПАША · Удаление OZ/WB
            </button>
          </nav>

          <div className="min-w-0 px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-7">
            {protocol === 'jarvis' ? <JarvisPage /> : <PashaPage />}
          </div>
        </div>
      </div>
    </main>
  )
}
