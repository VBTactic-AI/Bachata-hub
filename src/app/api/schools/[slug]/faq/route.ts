import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  createSchoolFaqItem,
  listSchoolFaqItems,
  SchoolFaqItemValidationError,
} from "@/server/schools/school-faq-service";
import { SchoolForbiddenError, SchoolNotFoundError } from "@/server/schools/update-school";

// [slug] в пути — тот же паттерн, что и у /api/schools/[slug]/profile:
// школа ищется по slug, дальше сервис проверяет владение по её id.
const createSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

async function resolveSchoolId(slug: string) {
  const school = await prisma.school.findUnique({ where: { slug }, select: { id: true } });
  return school?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await params;
  const schoolId = await resolveSchoolId(slug);
  if (!schoolId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const items = await listSchoolFaqItems(schoolId, user);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await params;
  const schoolId = await resolveSchoolId(slug);
  if (!schoolId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await createSchoolFaqItem(schoolId, user, parsed.data);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof SchoolFaqItemValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
