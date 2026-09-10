import { NextRequest, NextResponse } from "next/server";
import { startRoundManually } from "@/server/competition/draw-manual";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await startRoundManually(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
