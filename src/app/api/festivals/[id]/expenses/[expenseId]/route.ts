import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { updateFestivalExpense, deleteFestivalExpense, FestivalExpenseValidationError } from "@/server/events/festival-expense-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const EXPENSE_CATEGORIES = ["ARTISTS", "VENUE", "MARKETING", "EQUIPMENT", "OTHER"] as const;
const EXPENSE_STATUSES = ["PENDING", "PAID"] as const;

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().optional().nullable(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  note: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { expenseId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const expense = await updateFestivalExpense(expenseId, user, parsed.data);
    return NextResponse.json({ ok: true, expense });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof FestivalExpenseValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { expenseId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteFestivalExpense(expenseId, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
