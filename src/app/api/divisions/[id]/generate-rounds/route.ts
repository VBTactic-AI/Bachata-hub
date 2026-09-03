import { NextRequest, NextResponse } from "next/server";
import { generateRounds } from "@/server/competition/generate-rounds";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await generateRounds(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return respondToDomainError(e);
  }
}
