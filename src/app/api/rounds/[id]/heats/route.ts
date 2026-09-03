import { NextRequest, NextResponse } from "next/server";
import { createHeat } from "@/server/competition/create-heat";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const heat = await createHeat(id);
    return NextResponse.json({ ok: true, heat });
  } catch (e) {
    return respondToDomainError(e);
  }
}
