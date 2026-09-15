import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createPassTemplate, listPassTemplatesForUser, PassTemplateValidationError } from "@/server/events/pass-template-service";

const PASS_TYPES = ["FULL_PASS", "PARTY_PASS", "WORKSHOP_PASS", "DAY_PASS", "COMPETITION_PASS", "VIP_PASS", "FREE_PASS", "CUSTOM"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(PASS_TYPES),
  price: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  allowMultipleEntry: z.boolean().optional(),
});

// Шаблоны Pass организатора — не привязаны к событию (см. комментарий у
// модели PassTemplate в schema.prisma).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const templates = await listPassTemplatesForUser(user);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const template = await createPassTemplate(user, parsed.data);
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    if (e instanceof PassTemplateValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
