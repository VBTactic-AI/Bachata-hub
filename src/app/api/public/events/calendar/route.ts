import { NextRequest, NextResponse } from "next/server";
import { eventsForCalendarMonth } from "@/lib/events";

// Публичный, БЕЗ авторизации — тот же принцип, что и у /api/public/competitions/[id]/screen:
// виджет календаря на главной подгружает соседние месяцы кликом "вперёд/назад"
// без полной перезагрузки страницы. Отдаёт только уже публичные поля события
// (те же, что видны карточкой на /events).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year"));
  const month = Number(sp.get("month"));
  const cityId = sp.get("city") || null;

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Некорректные год или месяц." }, { status: 400 });
  }

  const events = await eventsForCalendarMonth(cityId, year, month);

  return NextResponse.json({
    year,
    month,
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      format: e.format,
      startsAt: e.startsAt.toISOString(),
      cityName: e.cityName,
      schoolName: e.schoolName,
    })),
  });
}
