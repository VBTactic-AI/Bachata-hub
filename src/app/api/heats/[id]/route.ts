import { NextRequest, NextResponse } from "next/server";
import { deleteHeat } from "@/server/competition/create-heat";
import { respondToDomainError } from "@/server/http";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await deleteHeat(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
