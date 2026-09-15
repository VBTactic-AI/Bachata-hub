import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { exportEventRegistrationsCsv } from "@/server/events/registration-export";
import { RegistrationForbiddenError, RegistrationNotFoundError, type RegistrationSortBy } from "@/server/events/registration-service";
import { EVENT_REGISTRATION_STATUS_VALUES as STATUS_VALUES } from "@/lib/events/event-type-registry";

// §11 ТЗ (Event CRM) — экспорт CSV. Те же search/status/paid/sort, что и
// вкладка "Участники" (та же валидация значений, что и в page.tsx — простые
// ручные проверки по фиксированному набору значений, тот же приём, что и в
// остальных read-only GET-роутах проекта, см. searchEvents()/public/events
// /calendar; Zod здесь избыточен — ничего не мутирует).
const SORT_VALUES: RegistrationSortBy[] = ["date", "name", "paid"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const status = STATUS_VALUES.find((s) => s === sp.get("status"));
  const paidParam = sp.get("paid");
  const isPaid = paidParam === "yes" ? true : paidParam === "no" ? false : undefined;
  const sortBy = SORT_VALUES.find((s) => s === sp.get("sort"));
  const sortDir = sp.get("dir") === "desc" ? "desc" : "asc";

  try {
    const csv = await exportEventRegistrationsCsv(event.id, user, {
      search: sp.get("q") ?? undefined,
      status,
      isPaid,
      sortBy,
      sortDir,
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-registrations.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
