import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { setPromoCodeActive, updatePromoCode, deletePromoCode, PassValidationError } from "@/server/events/pass-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  code: z.string().min(1).optional(),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]).optional(),
  discountValue: z.number().positive().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  validUntil: z.string().nullable().optional(),
});

// Активация/деактивация ИЛИ полное редактирование попапом (2026-09-20,
// перенос UI-прототипа, по прямому запросу пользователя) — один и тот же
// эндпоинт, тело определяет, что меняется.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    // Единственное поле — короткий путь через уже существующую функцию.
    if (Object.keys(parsed.data).length === 1 && parsed.data.isActive !== undefined) {
      const promoCode = await setPromoCodeActive(id, user, parsed.data.isActive);
      return NextResponse.json({ ok: true, promoCode });
    }
    const promoCode = await updatePromoCode(id, user, {
      ...parsed.data,
      validUntil: parsed.data.validUntil !== undefined ? (parsed.data.validUntil ? new Date(parsed.data.validUntil) : null) : undefined,
    });
    return NextResponse.json({ ok: true, promoCode });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof PassValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deletePromoCode(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof PassValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
