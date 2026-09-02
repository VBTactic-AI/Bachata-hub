import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { uniqueSlug } from "@/lib/slug";

const schema = z.object({
  title: z.string().min(3).max(160),
  cityId: z.string(),
  schoolId: z.string().optional(),
  organizerName: z.string().optional(),
  format: z.enum(["PARTY", "MASTERCLASS", "FESTIVAL", "CONTEST", "INTENSIVE"]),
  level: z.enum(["BEGINNER", "ALL_LEVELS", "ADVANCED"]),
  startsAt: z.string(),
  venueName: z.string().min(1),
  venueAddress: z.string().optional(),
  description: z.string().optional(),
  priceText: z.string().optional(),
  externalLinkUrl: z.string().url().optional().or(z.literal("")),
  photoUrl: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateEvents(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // представитель школы может создавать события только от имени своей школы
  if (data.schoolId) {
    const school = await prisma.school.findUnique({ where: { id: data.schoolId } });
    if (!school || (user.role === "SCHOOL_REP" && school.ownerUserId !== user.id)) {
      return NextResponse.json({ error: "forbidden_school" }, { status: 403 });
    }
  }

  const slug = await uniqueSlug("event", data.title);

  // event_type сегодня всегда REGULAR, кроме формата "конкурс" — уже сейчас
  // помечаем его отдельным типом, точка расширения под слой 3 (см. схему).
  const eventType = data.format === "CONTEST" ? "CONTEST" : "REGULAR";

  const event = await prisma.event.create({
    data: {
      slug,
      title: data.title,
      cityId: data.cityId,
      schoolId: data.schoolId || undefined,
      organizerName: data.schoolId ? undefined : data.organizerName || undefined,
      format: data.format,
      eventType,
      level: data.level,
      startsAt: new Date(data.startsAt),
      venueName: data.venueName,
      venueAddress: data.venueAddress || undefined,
      description: data.description || undefined,
      priceText: data.priceText || undefined,
      externalLinkUrl: data.externalLinkUrl || undefined,
      photoUrl: data.photoUrl || undefined,
      tags: data.tags ?? [],
      moderationStatus: "PENDING",
      createdById: user.id,
    },
  });

  return NextResponse.json({ ok: true, event });
}
