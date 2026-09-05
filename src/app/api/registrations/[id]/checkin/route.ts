import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkInRegistration } from "@/server/competition/check-in";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

const schema = z.object({ late: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const [checkIn, serverMs] = await measureServerOperationWithDuration("admin.checkin", () =>
      checkInRegistration(id, parsed.data)
    );
    return NextResponse.json({ ok: true, checkIn }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
