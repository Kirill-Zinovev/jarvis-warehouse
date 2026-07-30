import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function cloudflareD1(): unknown | null {
  try {
    const context = getCloudflareContext()
    return (context.env as { DB?: unknown }).DB ?? null
  } catch {
    return null
  }
}

const d1 = cloudflareD1()

export const db = d1
  ? new PrismaClient({ adapter: new PrismaD1(d1 as never) })
  : globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
