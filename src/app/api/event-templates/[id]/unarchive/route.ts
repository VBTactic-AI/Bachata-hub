import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unarchiveEventTemplate, EventTemplateForbiddenError, EventTemplateNotFoundError } from "@/server/events/event-template-service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const template = await unarchiveEventTemplate(id, user);
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    if (e instanceof EventTemplateForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventTemplateNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
