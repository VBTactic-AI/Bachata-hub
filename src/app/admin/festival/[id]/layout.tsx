import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFestivalForEdit, computeFestivalStatus } from "@/server/events/festival-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { FestivalDashboardTabs } from "@/components/admin/festival/FestivalDashboardTabs";
import { formatDateTime } from "@/lib/format";

const STATUS_LABELS = { DRAFT: "Черновик", LINKED: "Не опубликован", PUBLISHED: "Опубликован" } as const;
const STATUS_VARIANTS = { DRAFT: "neutral", LINKED: "warning", PUBLISHED: "success" } as const;

// Единая оболочка ОДНОГО фестиваля (перенос UI, продолжение сервисного
// слоя — docs/FESTIVAL_SERVICE_LAYER_PLAN.md) — тот же паттерн, что и
// EventDashboardLayout (Events Engine): доступ проверяется здесь ОДИН раз
// для всего поддерева вкладок (hasFestivalAccess внутри getFestivalForEdit),
// дочерние страницы всё равно делают свою проверку через сервисные функции
// (defense-in-depth, CLAUDE.md §31) — они вызываются и напрямую через API.
export default async function FestivalDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let festival;
  try {
    festival = await getFestivalForEdit(id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) redirect("/admin/festival");
    throw e;
  }

  const status = computeFestivalStatus(festival);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <a href="/admin/festival" className="text-sm text-admin-muted hover:text-night-text hover:underline">
          ← К моим фестивалям
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{festival.name}</h1>
          <StatusBadge label={STATUS_LABELS[status]} variant={STATUS_VARIANTS[status]} />
        </div>
        <p className="m-0 mt-0.5 text-sm text-admin-muted">
          {formatDateTime(festival.startsAt)}
          {festival.endsAt ? ` — ${formatDateTime(festival.endsAt)}` : ""}
          {festival.venueName ? ` · ${festival.venueName}` : ""}
        </p>
      </div>

      <FestivalDashboardTabs festivalId={festival.id} />

      {children}
    </div>
  );
}
