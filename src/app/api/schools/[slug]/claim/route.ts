import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ proofNote: z.string().max(2000).optional() });

// Заявка "я представитель этой школы" НИКОГДА не публикуется автоматически —
// она только создаёт запись в очереди на ручную проверку модератором
// (см. ТЗ: "обязательна ручная проверка... лишь бы не давать первому
// встречному управлять чужой карточкой").
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "SCHOOL_REP" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const existingPending = await prisma.schoolClaim.findFirst({
    where: { schoolId: school.id, claimantId: user.id, status: "PENDING" },
  });
  if (existingPending) {
    return NextResponse.json({ ok: true, claim: existingPending });
  }

  const claim = await prisma.schoolClaim.create({
    data: {
      schoolId: school.id,
      claimantId: user.id,
      proofNote: parsed.data.proofNote,
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true, claim });
}
