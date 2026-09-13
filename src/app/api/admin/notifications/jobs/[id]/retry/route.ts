import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { processNotificationJob } from "@/server/notifications/process-job";

// Control Center (Phase 9) — "Повторить сейчас" на упавшем NotificationJob
// (провал ДО audience resolution — редкий, более системный случай, чем провал
// одной доставки). processNotificationJob() уже идемпотентен (no-op на DONE),
// поэтому повторный клик по уже обработанному job'у безопасен.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await processNotificationJob(id);

  return NextResponse.json({ ok: true });
}
