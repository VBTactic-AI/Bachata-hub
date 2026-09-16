import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getEventTemplate,
  updateEventTemplate,
  EventTemplateForbiddenError,
  EventTemplateNotFoundError,
  EventTemplateValidationError,
} from "@/server/events/event-template-service";
import { eventTemplatePatchSchema } from "@/server/events/series-schemas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const template = await getEventTemplate(id, user);
    return NextResponse.json({ template });
  } catch (e) {
    if (e instanceof EventTemplateForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventTemplateNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = eventTemplatePatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const template = await updateEventTemplate(id, user, parsed.data);
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    if (e instanceof EventTemplateForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventTemplateNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof EventTemplateValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
