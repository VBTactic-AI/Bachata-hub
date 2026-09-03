import { NextRequest, NextResponse } from "next/server";
import { addDivision } from "@/server/competition/add-division";
import { addDivisionSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addDivisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const division = await addDivision(id, parsed.data);
    return NextResponse.json({ ok: true, division });
  } catch (e) {
    return respondToDomainError(e);
  }
}
