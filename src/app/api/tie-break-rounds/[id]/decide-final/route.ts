import { NextRequest, NextResponse } from "next/server";
import { recordFinalTieBreakDecision } from "@/server/judging/final-advancement";
import { recordFinalTieBreakDecisionSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

// RANK_ALL (CLAUDE.md §22) — коллегиальное решение перетанцовки ФИНАЛА:
// судьи расставили всю tie-группу по местам. Отдельно от
// /api/tie-break-rounds/[id]/decide (SELECT_N — обычная перетанцовка).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = recordFinalTieBreakDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [, serverMs] = await measureServerOperationWithDuration("admin.tie_break_decide_final", () =>
      recordFinalTieBreakDecision(id, parsed.data.orderedRegistrationIds)
    );
    return NextResponse.json({ ok: true }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
