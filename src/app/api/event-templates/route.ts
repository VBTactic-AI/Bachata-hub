import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listEventTemplatesForUser } from "@/server/events/event-template-service";

// POST (создание пустого шаблона) больше нет — шаблон заводится ТОЛЬКО из
// уже заполненного Event (POST /api/event-drafts/[id]/save-as-template),
// см. комментарий у createEventTemplateFromEvent.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  const templates = await listEventTemplatesForUser(user, includeArchived);
  return NextResponse.json({ templates });
}
