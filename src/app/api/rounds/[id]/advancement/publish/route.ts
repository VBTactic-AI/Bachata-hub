import { NextRequest, NextResponse } from "next/server";
import { publishRoundAdvancement } from "@/server/results/round-advancement";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await publishRoundAdvancement(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
