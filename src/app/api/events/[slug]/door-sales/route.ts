import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordDoorSale, TicketValidationError } from "@/server/events/door-sale-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// "Продажа на входе" (2026-09-18) — см. комментарий у door-sale-service.ts.
// productId здесь — id самого Pass/TicketType (как в listSellableProductsForEvent),
// не Product.id.
const createSchema = z.object({
  kind: z.enum(["pass", "tickettype"]),
  productId: z.string().min(1),
  method: z.enum(["CASH", "TRANSFER"]),
  note: z.string().max(300).optional(),
});

async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug }, select: { id: true } });
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
    const sale = await recordDoorSale(event.id, parsed.data.kind, parsed.data.productId, parsed.data.method, user, parsed.data.note);
    return NextResponse.json({ ok: true, sale });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof TicketValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
