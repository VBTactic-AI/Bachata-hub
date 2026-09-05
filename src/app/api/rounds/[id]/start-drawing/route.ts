import { NextRequest, NextResponse } from "next/server";
import { startRoundDrawing } from "@/server/competition/start-round-drawing";
import { startDrawingSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = startDrawingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [, serverMs] = await measureServerOperationWithDuration("admin.start_drawing", () =>
      startRoundDrawing(id, parsed.data.callOrder)
    );
    return NextResponse.json({ ok: true }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
