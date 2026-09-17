import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createProgramItem, listProgramItems } from "@/server/events/program-item-service";
import { respondToEventsError } from "@/server/events/http";

const PROGRAM_ITEM_TYPES = ["WORKSHOP", "PARTY", "COMPETITION", "OTHER"] as const;

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(PROGRAM_ITEM_TYPES),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
  linkedEventId: z.string().optional().nullable(),
  order: z.number().int().optional(),
  capacity: z.number().int().positive().optional().nullable(),
  showCapacityPublicly: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const items = await listProgramItems(id, user);
    return NextResponse.json({ items });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await createProgramItem(id, user, {
      ...parsed.data,
      startTime: new Date(parsed.data.startTime),
      endTime: parsed.data.endTime ? new Date(parsed.data.endTime) : null,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return respondToEventsError(e);
  }
}
