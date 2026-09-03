import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";

export type DancerSearchResult = {
  dancerId: string;
  displayName: string;
  gender: "MALE" | "FEMALE" | null;
  email: string;
};

// "Тихон*" -> начинается с "Тихон"; "*чук" -> заканчивается на "чук";
// без "*" вообще -> просто подстрока где угодно в имени (самый терпимый
// вариант по умолчанию — организатору на живом check-in обычно проще
// продиктовать имя, чем объяснять синтаксис шаблонов).
function buildNameFilter(query: string): Prisma.StringFilter {
  const trimmed = query.trim();
  if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 1) {
    return { contains: trimmed.slice(1, -1), mode: "insensitive" };
  }
  if (trimmed.endsWith("*")) {
    return { startsWith: trimmed.slice(0, -1), mode: "insensitive" };
  }
  if (trimmed.startsWith("*")) {
    return { endsWith: trimmed.slice(1), mode: "insensitive" };
  }
  return { contains: trimmed.replace(/\*/g, ""), mode: "insensitive" };
}

// Поиск существующего участника по имени — помогает EVENT_ADMIN найти
// человека и подставить его email в форму регистрации, не выспрашивая у
// него email лично (люди редко помнят/диктуют email, а имя — легко).
// Право то же самое, что и у самой ручной регистрации (registerByAdmin) —
// это часть той же формы, не отдельный публичный поиск по базе танцоров.
export async function searchDancersByName(competitionId: string, query: string): Promise<DancerSearchResult[]> {
  await requirePermission("registration:manage", competitionId);

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const dancers = await prisma.dancer.findMany({
    where: { displayName: buildNameFilter(trimmed) },
    include: { user: { select: { email: true } } },
    orderBy: { displayName: "asc" },
    take: 10,
  });

  return dancers.map((d) => ({
    dancerId: d.id,
    displayName: d.displayName,
    gender: d.gender,
    email: d.user.email,
  }));
}
