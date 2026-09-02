import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().min(3).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await params;
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // Отзыв никто, кроме автора и модераторов, не видит, пока модератор его не
  // одобрит (moderationStatus: PENDING) — сам автор при этом видит свой
  // отзыв и его статус сразу же, см. школьную страницу.
  const review = await prisma.review.create({
    data: {
      schoolId: school.id,
      authorId: user.id,
      rating: parsed.data.rating,
      text: parsed.data.text,
      moderationStatus: "PENDING",
    },
  });

  return NextResponse.json({ ok: true, review });
}
