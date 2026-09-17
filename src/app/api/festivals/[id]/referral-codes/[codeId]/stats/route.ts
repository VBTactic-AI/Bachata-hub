import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getReferralCodeStats } from "@/server/events/festival-referral-code-service";
import { respondToEventsError } from "@/server/events/http";

// GET — агрегат атрибуции конкретного кода (количество билетов + суммы
// скидок/комиссий) для карточки кода в консоли фестиваля.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; codeId: string }> }) {
  const { codeId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const stats = await getReferralCodeStats(codeId, user);
    return NextResponse.json({ stats });
  } catch (e) {
    return respondToEventsError(e);
  }
}
