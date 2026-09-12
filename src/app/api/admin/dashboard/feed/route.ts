import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getRecentEventsFeed } from "@/lib/admin-dashboard";

// Опрос для "живой ленты" на /admin — тот же паттерн, что и у
// /api/heats/[id]/rotation (poll, не push, наименьшая операционная сложность,
// docs/00_DECISIONS.md A12). Только чтение, без мутаций — MFA-гейт не нужен
// (AUTH_SECURITY_SPEC.md §15 требует его для чувствительных ОПЕРАЦИЙ, не для
// просмотра агрегированных счётчиков), но доступ всё равно только для ADMIN,
// как и у самой вкладки "Модерация".
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const events = await getRecentEventsFeed(12);
  return NextResponse.json({ events });
}
