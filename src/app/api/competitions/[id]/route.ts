import { NextRequest, NextResponse } from "next/server";
import { deleteCompetition } from "@/server/competition/delete-competition";
import { deleteCompetitionSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = deleteCompetitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await deleteCompetition(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
