import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadCount } from "@/server/notifications/notification-center";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const count = await getUnreadCount(user.id);
  return NextResponse.json({ count });
}
