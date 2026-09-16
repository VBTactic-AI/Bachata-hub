import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createEventTemplateFromEvent, EventTemplateForbiddenError, EventTemplateNotFoundError, EventTemplateValidationError } from "@/server/events/event-template-service";
import { saveEventAsTemplateSchema } from "@/server/events/series-schemas";

// "Сохранить как шаблон" — опция шага "Публикация" в EventWizard (не
// отдельная форма, см. комментарий у createEventTemplateFromEvent).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = saveEventAsTemplateSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const template = await createEventTemplateFromEvent(id, user, parsed.data.name);
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    if (e instanceof EventTemplateForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventTemplateNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof EventTemplateValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
