import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isEventDirectlyVisible } from "@/lib/events";
import { buildIcsEvent } from "@/lib/ics";

// Публичный, БЕЗ авторизации — тот же гейт видимости, что и у /events/[slug]
// (isEventDirectlyVisible), не полный activeEventFilter(): по прямой ссылке
// на .ics должно работать всё то же, что открывается по прямой ссылке на
// саму страницу события (владелец/модератор может скачать .ics до
// публикации), просто мы не идём по отдельному auth-пути ради файла с датой.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      venueName: true,
      venueAddress: true,
      cityId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      moderationStatus: true,
      city: { select: { nameRu: true } },
    },
  });

  if (!event || !isEventDirectlyVisible(event)) {
    return NextResponse.json({ error: "Событие не найдено." }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const location = [event.venueName, event.venueAddress, event.city.nameRu].filter(Boolean).join(", ");

  const ics = buildIcsEvent({
    uid: `event-${event.id}@bachata-hub`,
    title: event.title,
    description: event.description,
    location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    url: `${siteUrl}/events/${event.slug}`,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    },
  });
}
