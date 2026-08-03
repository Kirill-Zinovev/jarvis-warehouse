import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jarvis — подбор коробов для отгрузки',
  description: 'Сопоставление плана отгрузки со складскими остатками и подбор коробов по артикулам.',
  icons: {
    icon: '/jarvis-logo.svg',
    shortcut: '/jarvis-logo.svg',
    apple: '/jarvis-logo.svg',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
