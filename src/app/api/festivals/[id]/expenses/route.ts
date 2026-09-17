import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createFestivalExpense, listFestivalExpenses, FestivalExpenseValidationError } from "@/server/events/festival-expense-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const EXPENSE_CATEGORIES = ["ARTISTS", "VENUE", "MARKETING", "EQUIPMENT", "OTHER"] as const;
const EXPENSE_STATUSES = ["PENDING", "PAID"] as const;

const createSchema = z.object({
  title: z.string().min(1),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().min(0),
  currency: z.string().optional().nullable(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  note: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const expenses = await listFestivalExpenses(id, user);
    return NextResponse.json({ expenses });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const expense = await createFestivalExpense(id, user, parsed.data);
    return NextResponse.json({ ok: true, expense });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof FestivalExpenseValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
