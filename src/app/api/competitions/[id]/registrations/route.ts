import { NextRequest, NextResponse } from "next/server";
import { registerByAdmin, registerSelf } from "@/server/competition/register-competitor";
import { registerByAdminSchema, registerSelfSchema } from "@/server/competition/registration-schemas";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

// Один и тот же эндпоинт для self-service и админской регистрации:
// присутствие email в теле запроса означает "админ регистрирует кого-то" —
// сама авторизация (registration:manage) проверяется внутри registerByAdmin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: competitionId } = await params;
  const body = await req.json().catch(() => null);

  if (body && typeof body === "object" && "email" in body) {
    const parsed = registerByAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
    }
    try {
      const [registration, serverMs] = await measureServerOperationWithDuration("admin.register_competitor", () =>
        registerByAdmin(competitionId, parsed.data)
      );
      return NextResponse.json({ ok: true, registration }, { headers: serverTimingHeader(serverMs) });
    } catch (e) {
      return respondToDomainError(e);
    }
  }

  const parsed = registerSelfSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const [registration, serverMs] = await measureServerOperationWithDuration("public.register_self", () =>
      registerSelf(competitionId, parsed.data)
    );
    return NextResponse.json({ ok: true, registration }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
