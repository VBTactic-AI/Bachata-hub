import { NextRequest, NextResponse } from "next/server";
import { removeDrawHelper } from "@/server/competition/draw-helper";
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
