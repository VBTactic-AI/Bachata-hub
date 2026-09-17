import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createPass, listPassesForEvent, PassValidationError } from "@/server/events/pass-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// Ticket Engine — CRUD для Pass одного события. Создание/редактирование —
// только владелец события/ADMIN (см. комментарий в pass-service.ts).

const PASS_TYPES = ["FULL_PASS", "PARTY_PASS", "WORKSHOP_PASS", "DAY_PASS", "COMPETITION_PASS", "VIP_PASS", "FREE_PASS", "CUSTOM"] as const;
const REFUND_POLICIES = ["NONE", "UNTIL_DATE", "PARTIAL", "FULL"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(PASS_TYPES),
  price: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  salesStartAt: z.coerce.date().optional().nullable(),
  salesEndAt: z.coerce.date().optional().nullable(),
  validFrom: z.coerce.date().optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().optional(),
  imageUrl: z.string().optional().nullable(),
  allowMultipleEntry: z.boolean().optional(),
  refundPolicy: z.enum(REFUND_POLICIES).optional(),
  refundDeadline: z.coerce.date().optional().nullable(),
  refundFeePercent: z.number().min(0).max(100).optional().nullable(),
});

async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug }, select: { id: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const passes = await listPassesForEvent(event.id, user);
    return NextResponse.json({ passes });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const pass = await createPass(event.id, user, parsed.data);
    return NextResponse.json({ ok: true, pass });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof PassValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
