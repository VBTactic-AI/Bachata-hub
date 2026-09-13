import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markAllAsRead } from "@/server/notifications/notification-center";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const count = await markAllAsRead(user.id);
  return NextResponse.json({ ok: true, count });
}
