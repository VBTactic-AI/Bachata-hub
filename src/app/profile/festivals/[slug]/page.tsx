import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMyDancerRef } from "@/lib/dancer";
import { getMyFestivalAccess } from "@/server/events/festival-member-service";
import { Card } from "@/components/ui/card";
import { FestivalPassQrCode } from "@/components/festival/FestivalPassQrCode";

// Festival Engine — Stage 6 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Личный кабинет участника фестиваля: свой Pass + расписание, доступное
// именно этому Pass (PassAccessGrant). Бизнес-логика — целиком в
// getMyFestivalAccess() (festival-member-service.ts), здесь только вёрстка.
// QR (2026-09-17, следующий заход) — FestivalPassQrCode.tsx, генерируется на
// клиенте из ticket.id (библиотека `qrcode` установлена пользователем
// вручную — npm registry был недоступен через прокси предыдущей сессии).

const PROGRAM_ITEM_TYPE_LABELS: Record<string, string> = {
  WORKSHOP: "Мастер-класс",
  PARTY: "Вечеринка",
  COMPETITION: "Конкурс",
  OTHER: "Другое",
};

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

  const access = await getMyFestivalAccess(slug, dancer.id);
  if (!access) notFound();

  const { festival, ticket, accessibleProgramItems } = access;

  return (
    <div className="flex flex-col gap-5">
      <div>
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
          <Card className="flex flex-col items-center gap-3 border-night-border bg-night-card py-6 text-center">
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
            {accessibleProgramItems.length === 0 ? (
              <p className="text-sm text-night-muted">Программа фестиваля пока не опубликована.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {accessibleProgramItems.map((item) => {
                  const body = (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-night-text">{item.title}</strong>
                        <span className="shrink-0 rounded-full bg-night-card2 px-2.5 py-1 text-xs font-semibold text-night-pink">
                          {PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-night-muted">
                        {formatDateTime(item.startTime)}
                        {item.endTime ? ` — ${formatDateTime(item.endTime)}` : ""}
                        {item.teacher ? ` · ${item.teacher.name}` : ""}
                      </p>
                    </>
                  );

                  return item.linkedEvent ? (
                    <Link key={item.id} href={`/events/${item.linkedEvent.slug}`} className="block no-underline">
                      <Card interactive className="border-night-border bg-night-card hover:border-night-primary/60">
                        {body}
                      </Card>
                    </Link>
                  ) : (
                    <Card key={item.id} className="border-night-border bg-night-card">
                      {body}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
