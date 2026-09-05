import { NextRequest, NextResponse } from "next/server";
import { getPublicScreenView } from "@/server/public/public-screen-view";

// Публичный, БЕЗ авторизации — большое табло опрашивает этот роут напрямую
// (Этап 12). Отдаёт только то, что и так видно любому зрителю в зале
// (текущий заход, участники по номерам, таймер) — никаких приватных данных.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getPublicScreenView(id);
  if (!view) {
    return NextResponse.json({ error: "Соревнование не найдено." }, { status: 404 });
  }
  return NextResponse.json(view);
}
