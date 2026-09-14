import { NextRequest, NextResponse } from "next/server";
import { getUpcomingEventsForSchool } from "@/lib/school-discovery";

// Публичный, без авторизации: те же события, что уже видны на /events и на
// странице школы — просто отфильтрованные по одной школе для карусели на
// главной (src/components/SchoolEventsDiscovery.tsx). schoolId=all (или
// отсутствие параметра) — события всех школ. Намеренно не кэшируем на
// уровне роута (route handler caching в Next 15 требует отдельной настройки
// со своими нюансами) — запрос лёгкий (один индексированный SELECT), а
// список школ уже кэшируется в getSchoolDiscoveryData.
export async function GET(req: NextRequest) {
  const schoolId = req.nextUrl.searchParams.get("schoolId");
  const events = await getUpcomingEventsForSchool(schoolId && schoolId !== "all" ? schoolId : null, 6);
  return NextResponse.json({ events });
}
