import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ status: z.enum(["GOING", "WENT"]) });

async function getDancerAndEvent(slug: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const dancer = await prisma.dancer.findUnique({ where: { userId: user.id } });
  if (!dancer) return { error: NextResponse.json({ error: "no_dancer_profile" }, { status: 400 }) };

  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };

  return { dancer, event };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { dancer, event, error } = await getDancerAndEvent(slug);
  if (error) return error;

  const attendance = await prisma.attendance.upsert({
    where: { dancerId_eventId: { dancerId: dancer!.id, eventId: event!.id } },
    create: { dancerId: dancer!.id, eventId: event!.id, status: parsed.data.status, source: "SELF_REPORTED" },
    update: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true, attendance });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { dancer, event, error } = await getDancerAndEvent(slug);
  if (error) return error;

  await prisma.attendance
    .delete({ where: { dancerId_eventId: { dancerId: dancer!.id, eventId: event!.id } } })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
