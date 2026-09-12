import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { reorderEventMedia, EventMediaValidationError } from "@/server/events/event-media-service";
import { EventForbiddenError, EventNotFoundError } from "@/server/events/event-service";

const schema = z.object({ order: z.array(z.string()).min(1) });

// Event Media Gallery — drag&drop сортировка (задача §12): клиент шлёт
// полный список id медиа события в новом порядке за один запрос.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    await reorderEventMedia(id, parsed.data.order, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    if (err instanceof EventMediaValidationError) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    throw err;
  }
}
