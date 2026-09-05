import { NextRequest, NextResponse } from "next/server";
import { publishRoundAdvancement } from "@/server/results/round-advancement";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [, serverMs] = await measureServerOperationWithDuration("admin.advancement_publish", () =>
      publishRoundAdvancement(id)
    );
    return NextResponse.json({ ok: true }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
