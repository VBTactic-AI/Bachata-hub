import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  replaceEventMedia,
  setMainEventMedia,
  setEventMediaPosition,
  deleteEventMedia,
  EventMediaValidationError,
} from "@/server/events/event-media-service";
import { EventForbiddenError, EventNotFoundError } from "@/server/events/event-service";

function mapError(err: unknown) {
  if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (err instanceof EventForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
  if (err instanceof EventMediaValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}

// Event Media Gallery — "Replace" (задача §2): та же строка EventMedia,
// новый файл, старый объект Storage удаляется.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, mediaId } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const media = await replaceEventMedia(id, mediaId, user, file);
    return NextResponse.json({ ok: true, media });
  } catch (err) {
    return mapError(err);
  }
}

const patchSchema = z.object({
  isMain: z.literal(true).optional(),
  objectPosition: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
});

// PATCH { isMain: true } — "Set as main". PATCH { objectPosition } — задача
// §11 (простой выбор стороны кропа, без полноценного визуального редактора).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, mediaId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    if (parsed.data.isMain) await setMainEventMedia(id, mediaId, user);
    if (parsed.data.objectPosition) await setEventMediaPosition(id, mediaId, user, parsed.data.objectPosition);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}

// DELETE ?newMainId=<id> — "Choose another cover" (задача §14) применяется в
// одной транзакции сервиса вместе с удалением; без параметра — "Delete
// anyway", сервис сам предсказуемо повышает следующую по sortOrder.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, mediaId } = await params;
  const newMainId = req.nextUrl.searchParams.get("newMainId") ?? undefined;

  try {
    await deleteEventMedia(id, mediaId, user, { newMainId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}
