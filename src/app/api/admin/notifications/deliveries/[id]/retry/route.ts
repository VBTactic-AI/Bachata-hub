import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { retryDeliveryNow, DeliveryNotFoundError } from "@/server/notifications/process-job";

// Control Center (Phase 9) — "Повторить сейчас" на конкретной упавшей
// доставке, без ожидания следующего sweep'а/nextRetryAt.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    await retryDeliveryNow(id);
  } catch (err) {
    if (err instanceof DeliveryNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
