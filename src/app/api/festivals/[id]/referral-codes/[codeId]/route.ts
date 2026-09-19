import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { setReferralCodeActive, updateReferralCode, deleteReferralCode } from "@/server/events/festival-referral-code-service";
import { respondToEventsError } from "@/server/events/http";

const DISCOUNT_TYPES = ["PERCENT", "FIXED_AMOUNT"] as const;
const COMMISSION_TYPES = ["PERCENT", "FIXED_AMOUNT"] as const;

// PATCH — либо только переключение active (тот же короткий путь, что и
// раньше), либо полное редактирование попапом (2026-09-20, по прямому
// запросу пользователя — отменяет более раннее ограничение "без update").
const patchSchema = z.object({
  active: z.boolean().optional(),
  code: z.string().min(1).optional(),
  ownerTeacherId: z.string().optional().nullable(),
  ownerSchoolId: z.string().optional().nullable(),
  discountType: z.enum(DISCOUNT_TYPES).optional().nullable(),
  discountValue: z.number().positive().optional().nullable(),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionValue: z.number().positive().optional(),
  startsAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; codeId: string }> }) {
  const { codeId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    if (Object.keys(parsed.data).length === 1 && parsed.data.active !== undefined) {
      const code = await setReferralCodeActive(codeId, user, parsed.data.active);
      return NextResponse.json({ ok: true, code });
    }
    const { ownerTeacherId, ownerSchoolId, startsAt, expiresAt, active, ...rest } = parsed.data;
    const code = await updateReferralCode(codeId, user, {
      ...rest,
      active,
      ...(ownerTeacherId !== undefined || ownerSchoolId !== undefined
        ? { owner: ownerTeacherId ? { ownerTeacherId } : { ownerSchoolId: ownerSchoolId! } }
        : {}),
      ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : null } : {}),
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
    });
    return NextResponse.json({ ok: true, code });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; codeId: string }> }) {
  const { codeId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteReferralCode(codeId, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToEventsError(e);
  }
}
