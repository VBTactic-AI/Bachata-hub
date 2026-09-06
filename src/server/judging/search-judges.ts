import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { buildNameFilter } from "../competition/search-dancers";

export type JudgeSearchResult = {
  judgeUserId: string;
  displayName: string;
  email: string;
};

// Поиск кандидата в судьи по имени — та же проблема, что и у
// searchDancersByName (organizer живьём диктует имя, не email), но для формы
// "Добавить нового судью" (DivisionJudgesPanel.tsx), которая раньше искала
// только по точному email — с реальными списками судей на 5+ человек это
// было неудобно (найдено пользователем на реальных данных, 2026-09-06).
// Судья — обычный User (assignJudge ищет по User.email, не по Dancer), но
// имя есть только у профиля танцора (User.dancer.displayName) — если у
// человека профиля танцора нет, найти его по имени нельзя, только по email
// (как и раньше).
export async function searchJudgeCandidatesByName(competitionId: string, query: string): Promise<JudgeSearchResult[]> {
  await requirePermission("judge:assign", competitionId);

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const dancers = await prisma.dancer.findMany({
    where: { displayName: buildNameFilter(trimmed) },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { displayName: "asc" },
    take: 10,
  });

  return dancers.map((d) => ({
    judgeUserId: d.user.id,
    displayName: d.displayName,
    email: d.user.email,
  }));
}
