import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { updateSchoolFaqItem, deleteSchoolFaqItem, SchoolFaqItemValidationError } from "@/server/schools/school-faq-service";
import { SchoolForbiddenError, SchoolNotFoundError } from "@/server/schools/update-school";

const patchSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await updateSchoolFaqItem(itemId, user, parsed.data);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof SchoolFaqItemValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteSchoolFaqItem(itemId, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
