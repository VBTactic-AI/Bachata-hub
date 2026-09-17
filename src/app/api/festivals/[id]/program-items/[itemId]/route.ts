import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { updateProgramItem, deleteProgramItem } from "@/server/events/program-item-service";
import { respondToEventsError } from "@/server/events/http";

const PROGRAM_ITEM_TYPES = ["WORKSHOP", "PARTY", "COMPETITION", "OTHER"] as const;

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(PROGRAM_ITEM_TYPES).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
  linkedEventId: z.string().optional().nullable(),
  order: z.number().int().optional(),
  capacity: z.number().int().positive().optional().nullable(),
  showCapacityPublicly: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await updateProgramItem(itemId, user, {
      ...parsed.data,
      startTime: parsed.data.startTime ? new Date(parsed.data.startTime) : undefined,
      endTime: parsed.data.endTime !== undefined ? (parsed.data.endTime ? new Date(parsed.data.endTime) : null) : undefined,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteProgramItem(itemId, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToEventsError(e);
  }
}
