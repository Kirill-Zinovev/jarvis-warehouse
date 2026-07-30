import { JarvisPage } from '@/components/jarvis/jarvis-page'

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.10),transparent_35%)]">
      <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6 lg:p-8">
        <div className="glass-strong overflow-hidden rounded-[2rem] shadow-2xl shadow-rose-950/10">
          <div className="p-4 md:p-6">
            <JarvisPage />
          </div>
        </div>
      </div>
    </main>
  )
}
