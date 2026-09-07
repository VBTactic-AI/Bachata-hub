import { NextRequest, NextResponse } from "next/server";
import { swapResultPlacements } from "@/server/results/results";
import { swapResultPlacementsSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = swapResultPlacementsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await swapResultPlacements(parsed.data.resultIdA, parsed.data.resultIdB, parsed.data.reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
