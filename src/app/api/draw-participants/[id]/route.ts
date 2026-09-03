import { NextRequest, NextResponse } from "next/server";
import { removeDrawHelper, replaceDrawHelper } from "@/server/competition/draw-helper";
import { replaceDrawHelperSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await removeDrawHelper(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = replaceDrawHelperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const participant = await replaceDrawHelper(id, parsed.data.registrationId);
    return NextResponse.json({ ok: true, participant });
  } catch (e) {
    return respondToDomainError(e);
  }
}
