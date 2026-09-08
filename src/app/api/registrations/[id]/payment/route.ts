import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setRegistrationPayment } from "@/server/competition/payment";
import { respondToDomainError } from "@/server/http";

const schema = z.object({ isPaid: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await setRegistrationPayment(id, parsed.data.isPaid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
