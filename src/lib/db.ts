import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // E1 vague 1 : en production, seule la journalisation utile est conservée.
    // 'query' inondait le journal PM2 de chaque requête SQL (I/O + CPU permanents,
    // dilution des messages utiles, données personnelles dans les logs).
    log:
      process.env.NODE_ENV === 'production'
        ? ['warn', 'error']
        : ['query', 'warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
