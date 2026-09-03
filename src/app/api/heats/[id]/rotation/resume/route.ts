import { NextRequest, NextResponse } from "next/server";
import { resumeRotation } from "@/server/rotation/rotation-engine";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await resumeRotation(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
