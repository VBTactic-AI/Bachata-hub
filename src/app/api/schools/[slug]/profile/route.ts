import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { updateSchoolProfile, SchoolForbiddenError, SchoolNotFoundError } from "@/server/schools/update-school";

// PATCH — владелец школы редактирует свою карточку (/admin/school). Не для
// name/slug/city (те не в объёме первой версии CRM школы, докрутка позже).
// Сегмент [slug], а не [id] — тот же паттерн, что и у остальных
// api/schools/[slug]/** роутов (Next.js требует одно имя динамического
// сегмента на весь уровень пути) — school ищется по slug, дальше
// updateSchoolProfile() проверяет владение по её реальному id.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await params;
  const school = await prisma.school.findUnique({ where: { slug }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  try {
    const updated = await updateSchoolProfile(user, school.id, body);
    return NextResponse.json({ ok: true, school: updated });
  } catch (err) {
    if (err instanceof SchoolNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof SchoolForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
}
