import { NextRequest, NextResponse } from "next/server";
import { advanceRandomCouples } from "@/server/judging/final-random-couples";
import { respondToDomainError } from "@/server/http";
import { z } from "zod";

const bodySchema = z.object({ trackName: z.string().max(200).optional() });

// "Следующая пара" на всю прогрессию RANDOM_COUPLES — сервис сам решает,
// что делать (завершить текущую пару и начать следующую / завершить
// последнюю и запустить подсчёт) по фактическому состоянию заходов.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await advanceRandomCouples(id, parsed.data.trackName);
    return NextResponse.json(result);
  } catch (e) {
    return respondToDomainError(e);
  }
}
