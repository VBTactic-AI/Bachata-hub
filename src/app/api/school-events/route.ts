import { NextRequest, NextResponse } from "next/server";
import { getDiscoveryEventGroups, OTHER_EVENTS_ID } from "@/lib/school-discovery";
import { getPreferredCity } from "@/lib/city-preference";

// Публичный, без авторизации: те же события, что уже видны на /events и на
// странице школы — просто отфильтрованные по карточке карусели на главной
// (src/components/SchoolEventsDiscovery.tsx). schoolId=all (или отсутствие
// параметра) — события всех школ; schoolId=other — события без привязанной
// школы. Город берём из того же cookie, что и остальная персонализация
// главной (getPreferredCity) — карусель школ тоже фильтруется по городу
// (по прямому запросу пользователя, 2026-09-14), поэтому список событий при
// переключении школы должен использовать тот же город, иначе разошёлся бы со
// счётчиками на карточках. Намеренно не кэшируем на уровне роута — запрос
// лёгкий (два индексированных SELECT), а список школ/агрегаты уже
// кэшируются в getSchoolDiscoveryData.
export async function GET(req: NextRequest) {
  const schoolId = req.nextUrl.searchParams.get("schoolId");
  const filter = !schoolId || schoolId === "all" ? null : schoolId === OTHER_EVENTS_ID ? OTHER_EVENTS_ID : schoolId;
  const preferredCity = await getPreferredCity();
  const groups = await getDiscoveryEventGroups(filter, preferredCity?.id ?? null);
  return NextResponse.json(groups);
}
