import { NextRequest, NextResponse } from "next/server";
import { createHeat } from "@/server/competition/create-heat";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [heat, serverMs] = await measureServerOperationWithDuration("admin.create_heat", () => createHeat(id));
    return NextResponse.json({ ok: true, heat }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
