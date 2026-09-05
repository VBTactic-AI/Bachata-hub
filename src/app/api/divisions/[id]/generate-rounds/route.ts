import { NextRequest, NextResponse } from "next/server";
import { generateRounds } from "@/server/competition/generate-rounds";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [result, serverMs] = await measureServerOperationWithDuration("admin.generate_rounds", () => generateRounds(id));
    return NextResponse.json({ ok: true, ...result }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
