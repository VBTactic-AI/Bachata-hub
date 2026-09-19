import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyDancerRef } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getMyFestivalAccess } from "@/server/events/festival-member-service";
import { formatEventDate, formatEventTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { FestivalPassQrCode } from "@/components/festival/FestivalPassQrCode";
import { FestivalPublicProgram, type PublicProgramItem } from "@/components/FestivalPublicProgram";

// Festival Engine — Stage 6 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Личный кабинет участника фестиваля: свой Pass + расписание, доступное
// именно этому Pass (PassAccessGrant). Бизнес-логика — целиком в
// getMyFestivalAccess() (festival-member-service.ts), здесь только вёрстка.
// QR (2026-09-17, следующий заход) — FestivalPassQrCode.tsx, генерируется на
// клиенте из ticket.id (библиотека `qrcode` установлена пользователем
// вручную — npm registry был недоступен через прокси предыдущей сессии).
//
// Персональное приветствие + day-strip (Stage R10 переноса UI-прототипа,
// 2026-09-19) — day-strip переиспользует FestivalPublicProgram (тот же
// компонент, что и на публичной странице), группировка по дню считается
// здесь же, теми же средствами formatEventDate/formatEventTime.

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default async function MyFestivalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dancer = await getMyDancerRef();
  if (!dancer) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Личный кабинет фестиваля</h1>
        <p className="text-sm text-night-muted">
          У этого аккаунта нет профиля танцора — он появится сам собой, как только вы примете участие в конкурсе или мероприятии.
        </p>
      </div>
    );
  }

  const [access, dancerProfile] = await Promise.all([
    getMyFestivalAccess(slug, dancer.id),
    prisma.dancer.findUnique({ where: { id: dancer.id }, select: { displayName: true } }),
  ]);
  if (!access) notFound();

  const { festival, ticket, accessibleProgramItems } = access;

  const programDays: [string, PublicProgramItem[]][] =
    accessibleProgramItems.length > 0
      ? Array.from(
          accessibleProgramItems.reduce((map, item) => {
            const key = formatEventDate(item.startTime);
            const list = map.get(key) ?? [];
            list.push({
              id: item.id,
              title: item.title,
              type: item.type,
              timeLabel: item.endTime ? `${formatEventTime(item.startTime)}–${formatEventTime(item.endTime)}` : formatEventTime(item.startTime),
              teacherName: item.teacher?.name ?? null,
              capacity: item.capacity,
              showCapacityPublicly: item.showCapacityPublicly,
              linkedEventSlug: item.linkedEvent?.slug ?? null,
            });
            map.set(key, list);
            return map;
          }, new Map<string, PublicProgramItem[]>())
        )
      : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        {dancerProfile?.displayName && (
          <p className="m-0 mb-1 text-sm font-semibold text-night-pink">Привет, {dancerProfile.displayName}! 👋</p>
        )}
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text">{festival.name}</h1>
        <p className="mt-1 text-sm text-night-muted">
          {festival.venueName ? `${festival.venueName} · ` : ""}
          {formatDateTime(festival.startsAt)}
          {festival.endsAt ? ` — ${formatDateTime(festival.endsAt)}` : ""}
        </p>
      </div>

      {!ticket ? (
        <Card className="border-night-border bg-night-card">
          <p className="m-0 text-sm text-night-muted">
            У вас пока нет оплаченного Pass на этот фестиваль — расписание появится здесь сразу после покупки.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col items-center gap-3 border-night-primary/50 bg-gradient-to-b from-night-primary/10 to-night-card py-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-night-muted">Мой Pass</span>
            <strong className="font-night text-lg text-night-text">{ticket.passName}</strong>
            <FestivalPassQrCode value={ticket.id} />
            <div className="rounded-app-sm border border-night-border bg-night-bg px-4 py-3 font-mono text-xs tracking-widest text-night-text">
              {ticket.id}
            </div>
            <span className="text-xs text-night-muted">Покажите QR или код на входе</span>
          </Card>

          <div>
            <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Доступная вам программа</h2>
            {programDays.length === 0 ? (
              <p className="text-sm text-night-muted">Программа фестиваля пока не опубликована.</p>
            ) : (
              <FestivalPublicProgram days={programDays} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
