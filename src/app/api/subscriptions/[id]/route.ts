import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unsubscribe, SubscriptionNotFoundError } from "@/server/notifications/subscriptions";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await unsubscribe(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
