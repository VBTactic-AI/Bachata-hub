import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createFestivalPass, FestivalValidationError } from "@/server/events/festival-service";
import { PassValidationError } from "@/server/events/pass-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const PASS_TYPES = ["FULL_PASS", "PARTY_PASS", "WORKSHOP_PASS", "DAY_PASS", "COMPETITION_PASS", "VIP_PASS", "FREE_PASS", "CUSTOM"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(PASS_TYPES),
  price: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  salesStartAt: z.string().optional().nullable(),
  salesEndAt: z.string().optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  imageUrl: z.string().optional().nullable(),
  allowMultipleEntry: z.boolean().optional(),
});

// POST /api/festivals/[id]/passes — единственная точка создания Pass для
// фестиваля. Bridge-Event (Festival.eventId) создаётся лениво внутри
// createFestivalPass, если его ещё нет — организатор здесь НЕ выбирает "на
// каком событии продавать" (в отличие от обычного Pass, см.
// docs/FESTIVAL_SERVICE_LAYER_PLAN.md, Stage 1).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const pass = await createFestivalPass(id, user, {
      ...parsed.data,
      salesStartAt: parsed.data.salesStartAt ? new Date(parsed.data.salesStartAt) : null,
      salesEndAt: parsed.data.salesEndAt ? new Date(parsed.data.salesEndAt) : null,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
    });
    return NextResponse.json({ ok: true, pass });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof PassValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    if (e instanceof FestivalValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
