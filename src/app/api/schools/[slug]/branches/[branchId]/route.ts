import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateSchoolBranch, deleteSchoolBranch, schoolBranchInputSchema, SchoolBranchValidationError } from "@/server/schools/update-branches";
import { SchoolForbiddenError, SchoolNotFoundError } from "@/server/schools/update-school";

const patchSchema = schoolBranchInputSchema.partial();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; branchId: string }> }) {
  const { branchId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const branch = await updateSchoolBranch(branchId, user, parsed.data);
    return NextResponse.json({ ok: true, branch });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof SchoolBranchValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; branchId: string }> }) {
  const { branchId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteSchoolBranch(branchId, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
