import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createSchoolBranch, schoolBranchInputSchema, SchoolBranchValidationError } from "@/server/schools/update-branches";
import { SchoolForbiddenError, SchoolNotFoundError } from "@/server/schools/update-school";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await params;
  const school = await prisma.school.findUnique({ where: { slug }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schoolBranchInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const branch = await createSchoolBranch(school.id, user, parsed.data);
    return NextResponse.json({ ok: true, branch });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof SchoolBranchValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
