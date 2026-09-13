import { NextRequest, NextResponse } from "next/server";
import type { SubscriptionType } from "@prisma/client";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listBroadcastTargetOptions } from "@/server/notifications/broadcast";

const VALID_TYPES = new Set(["EVENT", "SCHOOL", "CITY", "COUNTRY", "EVENT_TYPE", "INSTRUCTOR"]);

// Кандидаты цели рассылки — короткий список (CITY/COUNTRY/EVENT_TYPE) или
// поиск по имени (SCHOOL/EVENT/INSTRUCTOR), см. broadcast.ts.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (!VALID_TYPES.has(type)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const query = req.nextUrl.searchParams.get("q") ?? undefined;
  const options = await listBroadcastTargetOptions(type as SubscriptionType, query);
  return NextResponse.json({ options });
}
