import { NextRequest, NextResponse } from "next/server";
import { getFinalSettings, setFinalSettings } from "@/server/competition/final-settings";
import { setFinalSettingsSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const settings = await getFinalSettings(id);
    return NextResponse.json(settings);
  } catch (e) {
    return respondToDomainError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setFinalSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await setFinalSettings(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
