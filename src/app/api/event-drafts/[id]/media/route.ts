import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadEventMedia, EventMediaValidationError } from "@/server/events/event-media-service";
import { EventForbiddenError, EventNotFoundError } from "@/server/events/event-service";

// Event Media Gallery — загрузка одной афиши/фото за запрос (multipart,
// поле "file"). Клиент загружает несколько файлов параллельными запросами —
// так неудача одного файла естественно не затрагивает остальные (задача §19
// "не откатывать успешно загруженные фотографии"), без отдельной логики на
// сервере.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const media = await uploadEventMedia(id, user, file);
    return NextResponse.json({ ok: true, media });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    if (err instanceof EventMediaValidationError) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    throw err;
  }
}
