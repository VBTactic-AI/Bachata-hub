import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { duplicateEventTemplate, EventTemplateForbiddenError, EventTemplateNotFoundError } from "@/server/events/event-template-service";

const bodySchema = z.object({ name: z.string().max(160).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const template = await duplicateEventTemplate(id, user, parsed.data.name);
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    if (e instanceof EventTemplateForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventTemplateNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
