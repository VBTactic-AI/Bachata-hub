import { NextRequest, NextResponse } from "next/server";
import { startRotation } from "@/server/rotation/rotation-engine";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await startRotation(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
