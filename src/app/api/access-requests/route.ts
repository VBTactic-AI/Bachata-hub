import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { submitAccessRequest } from "@/server/access-requests/submit";
import { getMyAccessRequests } from "@/server/access-requests/queries";
import { AccessRequestValidationError } from "@/server/access-requests/errors";

// GET — свои заявки (для карточки статуса на /profile).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const requests = await getMyAccessRequests(user.id);
  return NextResponse.json({ requests });
}

// POST — подача анкеты "Стать организатором" (/become-organizer). Один вызов
// может создать несколько строк AccessRequest (по одной на отмеченный тип).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  try {
    const requests = await submitAccessRequest(user, body);
    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    if (err instanceof AccessRequestValidationError) {
      return NextResponse.json({ error: "invalid_input", issues: err.issues }, { status: 400 });
    }
    throw err;
  }
}
