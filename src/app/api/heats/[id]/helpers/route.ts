import { NextRequest, NextResponse } from "next/server";
import { addDrawHelper, listHelperCandidates } from "@/server/competition/draw-helper";
import { addDrawHelperSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";
import { registrationRoleSchema } from "@/server/competition/registration-schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = req.nextUrl.searchParams.get("role");
  const parsedRole = registrationRoleSchema.safeParse(role);
  if (!parsedRole.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const candidates = await listHelperCandidates(id, parsedRole.data);
    return NextResponse.json({ ok: true, ...candidates });
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addDrawHelperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const participant = await addDrawHelper(id, parsed.data.registrationId, parsed.data.role);
    return NextResponse.json({ ok: true, participant });
  } catch (e) {
    return respondToDomainError(e);
  }
}
