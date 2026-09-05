import { NextRequest, NextResponse } from "next/server";
import { splitHeatOverflow } from "@/server/competition/draw-engine";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [result, serverMs] = await measureServerOperationWithDuration("admin.split_heat", () => splitHeatOverflow(id));
    return NextResponse.json({ ok: true, ...result }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
