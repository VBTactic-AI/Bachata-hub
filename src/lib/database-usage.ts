import { prisma } from "./prisma";

// Лимиты бесплатного плана Supabase (supabase.com/docs/guides/platform/
// billing-on-supabase, проверено 2026-09-12). Supabase не даёт API для чтения
// собственных квот (ни для этих чисел, ни тем более для egress/MAU — это
// подтверждённое ограничение самого Supabase, не наша недоработка, см.
// docs/00_DECISIONS.md). Если организация перейдёт на платный план — эти
// числа придётся поправить вручную, узнать их программно неоткуда.
export const SUPABASE_FREE_PLAN_LIMITS = {
  databaseSizeBytes: 500 * 1024 * 1024, // 500 MB
  storageSizeBytes: 1 * 1024 * 1024 * 1024, // 1 GB
} as const;

// Ссылка на реальную страницу использования в Supabase Dashboard — для
// показателей, которые нельзя получить программно (egress/cached egress).
// Организация проекта "VBTactic-AI-Bachata-hub" (list_projects через Supabase
// MCP, 2026-09-12) — если проект когда-нибудь переедет в другую организацию,
// ссылку нужно будет поправить здесь.
export const SUPABASE_USAGE_DASHBOARD_URL = "https://supabase.com/dashboard/org/khjzwaofzudtiobxvdkd/usage";

export type DatabaseUsage = {
  databaseSizeBytes: number;
  // null — не удалось получить (например, нет доступа к схеме storage),
  // а не "0" — 0 означает "есть доступ, но данных нет", это разные вещи
  // (CLAUDE.md §16: не превращаем "нет данных" в "0" молча).
  storageSizeBytes: number | null;
  storageBucketsCount: number | null;
};

export async function getDatabaseUsage(): Promise<DatabaseUsage> {
  const [sizeRows, storageRows] = await Promise.all([
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    prisma
      .$queryRaw<{ bytes: bigint; buckets: bigint }[]>`
        SELECT
          COALESCE(SUM((o.metadata ->> 'size')::bigint), 0) AS bytes,
          COUNT(DISTINCT b.id) AS buckets
        FROM storage.buckets b
        LEFT JOIN storage.objects o ON o.bucket_id = b.id
      `
      .catch(() => null),
  ]);

  return {
    databaseSizeBytes: Number(sizeRows[0]?.bytes ?? 0n),
    storageSizeBytes: storageRows ? Number(storageRows[0]?.bytes ?? 0n) : null,
    storageBucketsCount: storageRows ? Number(storageRows[0]?.buckets ?? 0n) : null,
  };
}
