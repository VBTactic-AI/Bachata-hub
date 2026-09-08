import { NextResponse } from "next/server";
import { getCompetitionStatistics } from "@/server/statistics/competition-statistics";
import { getJudgeStatisticsForCompetition } from "@/server/statistics/judge-statistics";
import { respondToDomainError } from "@/server/http";

// Статистика по запросу, а не на каждой загрузке карточки соревнования.
//
// Раньше оба свода считались прямо в admin/competitions/[id]/page.tsx — то
// есть на КАЖДОМ рендере страницы, включая router.refresh() после любого
// клика организатора/судьи. Замерено (pg_stat_statements, 2026-09-08): это
// 12 SQL-запросов из 29 на странице, причём судейская аналитика тянет все
// JudgeScore + FinalJudgeScore соревнования и считает по ним корреляции.
// Аналитика не нужна для проведения соревнования — считаем её, только когда
// организатор реально открыл панель.
//
// RBAC не ослаблен: право statistics:view проверяется внутри самих сервисов
// (requirePermission), как и при рендере страницы.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [competition, judges] = await Promise.all([
      getCompetitionStatistics(id),
      getJudgeStatisticsForCompetition(id),
    ]);
    return NextResponse.json({ ok: true, competition, judges });
  } catch (e) {
    return respondToDomainError(e);
  }
}
