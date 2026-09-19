import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadFestivalCover } from "@/server/events/festival-service";
import { EventMediaValidationError } from "@/server/events/event-media-service";
import { respondToEventsError } from "@/server/events/http";

// Обложка фестиваля — одно фото за запрос (multipart, поле "file"), тот же
// upload-pipeline, что и у Event Media Gallery (2026-09-20, перенос
// UI-прототипа).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const festival = await uploadFestivalCover(id, user, file);
    return NextResponse.json({ ok: true, festival });
  } catch (e) {
    if (e instanceof EventMediaValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    return respondToEventsError(e);
  }
}
