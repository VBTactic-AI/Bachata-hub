import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { setReferralCodeActive } from "@/server/events/festival-referral-code-service";
import { respondToEventsError } from "@/server/events/http";

// PATCH — только переключение active (тот же контракт, что и у
// setPromoCodeActive/PATCH .../promo-codes/[id]) — реферальный код не
// поддерживает произвольное редактирование терминов после создания и не
// удаляется физически (см. комментарий в festival-referral-code-service.ts).
const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; codeId: string }> }) {
  const { codeId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const code = await setReferralCodeActive(codeId, user, parsed.data.active);
    return NextResponse.json({ ok: true, code });
  } catch (e) {
    return respondToEventsError(e);
  }
}
