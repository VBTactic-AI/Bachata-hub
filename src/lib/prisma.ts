import { PrismaClient } from "@prisma/client";

// Стандартный singleton-паттерн Prisma для Next.js (dev hot-reload не плодит
// новые подключения к БД).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
