import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createReferralCode, listReferralCodesForFestival } from "@/server/events/festival-referral-code-service";
import { respondToEventsError } from "@/server/events/http";

const DISCOUNT_TYPES = ["PERCENT", "FIXED_AMOUNT"] as const;
const COMMISSION_TYPES = ["PERCENT", "FIXED_AMOUNT"] as const;

const createSchema = z
  .object({
    code: z.string().min(1),
    ownerTeacherId: z.string().optional().nullable(),
    ownerSchoolId: z.string().optional().nullable(),
    discountType: z.enum(DISCOUNT_TYPES).optional().nullable(),
    discountValue: z.number().positive().optional().nullable(),
    commissionType: z.enum(COMMISSION_TYPES),
    commissionValue: z.number().positive(),
    active: z.boolean().optional(),
    startsAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
  })
  .refine((v) => Boolean(v.ownerTeacherId) !== Boolean(v.ownerSchoolId), {
    message: "Ровно один владелец — артист или школа.",
    path: ["ownerTeacherId"],
  });

// GET — список реферальных кодов фестиваля (организатор).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const codes = await listReferralCodesForFestival(id, user);
    return NextResponse.json({ codes });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const { ownerTeacherId, ownerSchoolId, startsAt, expiresAt, ...rest } = parsed.data;

  try {
    const code = await createReferralCode(id, user, {
      ...rest,
      owner: ownerTeacherId ? { ownerTeacherId } : { ownerSchoolId: ownerSchoolId! },
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    return NextResponse.json({ ok: true, code });
  } catch (e) {
    return respondToEventsError(e);
  }
}
