import { NextRequest, NextResponse } from "next/server";
import { calculateResults } from "@/server/results/results";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [result, serverMs] = await measureServerOperationWithDuration("admin.calculate_results", () => calculateResults(id));
    return NextResponse.json(result, { status: 201, headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
