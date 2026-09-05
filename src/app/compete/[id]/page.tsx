import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InfoCard } from "@/components/compete/InfoCard";
import { getPublicCompetitionView } from "@/server/public/public-competition-view";
import { REGISTRATION_ROLE_LABELS } from "@/lib/competition-labels";

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id }, select: { name: true } });
  return { title: competition?.name ?? "Соревнование" };
}

// Публичная карточка одного соревнования (по референсу пользователя,
// 2026-09-04; расширена Этапом 12 — docs/00_DECISIONS.md, публичная часть).
// Данные, которые можно показать кому угодно без логина, идут ЦЕЛИКОМ через
// getPublicCompetitionView (отдельный от admin сервис, явный allowlist
// полей, CLAUDE.md §42) — здесь отдельно только то, что зависит от ЛИЧНОГО
// статуса текущего посетителя (моя регистрация), не общедоступные данные.
export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [view, dancer] = await Promise.all([
    getPublicCompetitionView(id),
    user ? prisma.dancer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null,
  ]);
  if (!view) notFound();

  const myRegistration = dancer ? await prisma.registration.findFirst({ where: { competitionId: id, dancerId: dancer.id } }) : null;
  // Ссылка на судейский экран — раньше её нигде не было в интерфейсе
  // (только прямой URL /judging/[competitionId], найдено на живом
  // тестировании 2026-09-05): судья, которого назначили в админке, не мог
  // сам найти дорогу на свой экран оценок.
  const myJudgeAssignment = user
    ? await prisma.judgeAssignment.findFirst({ where: { judgeUserId: user.id, division: { competitionId: id } } })
    : null;

  const isOpen = view.status === "REGISTRATION_OPEN";
  const place = [view.cityName, view.venue].filter(Boolean).join(", ");

  return (
    <div className="stack gap-4 pb-4">
      <Link href="/compete" className="inline-flex items-center gap-1 text-sm text-night-muted no-underline hover:text-night-text">
        ← Назад
      </Link>

      <div
        className="relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-app bg-gradient-night-hero bg-cover bg-center p-5"
        style={view.photoUrl ? { backgroundImage: `url(${view.photoUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="relative">
          <h1 className="m-0 font-night text-2xl font-extrabold uppercase tracking-tight text-white">{view.name}</h1>
          {(view.startAt || place) && (
            <p className="m-0 mt-1 text-sm font-medium text-white/85">
              {view.startAt ? DATE_FMT.format(view.startAt).toUpperCase() : ""}
              {view.startAt && place ? " · " : ""}
              {place}
            </p>
          )}
        </div>
      </div>

      {view.liveStatus && (
        <Link
          href={`/screen/${id}`}
          className="block rounded-app border border-night-success/40 bg-night-success/10 px-4 py-3 text-center text-sm font-bold text-night-success no-underline"
        >
          ● Сейчас идёт: {view.liveStatus.divisionCategoryName} · {view.liveStatus.roundLabel} · Заход {view.liveStatus.heatNumber} — открыть табло →
        </Link>
      )}

      {myJudgeAssignment && (
        <Link
          href={`/judging/${id}`}
          className="block rounded-full border border-night-accent/40 bg-night-accent/10 py-3.5 text-center text-sm font-bold uppercase tracking-wide text-night-accent no-underline"
        >
          ⚖️ Судейство — открыть экран оценок
        </Link>
      )}

      {!user ? (
        <Link
          href={`/login?next=/compete/${id}`}
          className="block rounded-full bg-gradient-night-cta py-3.5 text-center text-sm font-bold uppercase tracking-wide text-white no-underline"
        >
          Войти, чтобы зарегистрироваться
        </Link>
      ) : myRegistration ? (
        <div className="rounded-full border border-night-success/40 bg-night-success/10 py-3.5 text-center text-sm font-bold text-night-success">
          ✓ Вы зарегистрированы
        </div>
      ) : isOpen ? (
        <Link
          href={`/compete/${id}/register`}
          className="block rounded-full bg-gradient-night-cta py-3.5 text-center text-sm font-bold uppercase tracking-wide text-white no-underline shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)]"
        >
          Зарегистрироваться
        </Link>
      ) : (
        <div className="rounded-full bg-night-card2 py-3.5 text-center text-sm font-bold text-night-disabled">Регистрация закрыта</div>
      )}

      {view.description && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">О событии</h2>
          <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-night-muted">{view.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {view.startAt && <InfoCard icon="📅" label="Дата" value={DATE_FMT.format(view.startAt)} />}
        {place && <InfoCard icon="📍" label="Место" value={place} />}
        {view.divisions.length > 0 && <InfoCard icon="🏆" label="Категории" value={view.divisions.map((d) => d.categoryName).join(", ")} />}
        {view.organizerName && <InfoCard icon="👤" label="Организатор" value={view.organizerName} />}
        <InfoCard icon="🧑‍🤝‍🧑" label="Участников" value={`${view.stats.registrationsCount} (${view.stats.leadersCount} вед. / ${view.stats.followersCount} вед.)`} />
        {view.judges.length > 0 && <InfoCard icon="⚖️" label="Судьи" value={view.judges.map((j) => j.displayName).join(", ")} />}
      </div>

      {(view.rulesText || view.rulesUrl) && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Правила</h2>
          {view.rulesText && <p className="m-0 mb-2 whitespace-pre-line text-sm leading-relaxed text-night-muted">{view.rulesText}</p>}
          {view.rulesUrl && (
            <a href={view.rulesUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-night-accent no-underline">
              Правила на внешнем сайте →
            </a>
          )}
        </div>
      )}

      {view.divisions.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Дивизионы</h2>
          <div className="stack gap-2">
            {view.divisions.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-app border border-night-border bg-night-card p-3">
                <span className="text-sm font-medium text-night-text">{d.categoryName}</span>
                <span className="text-sm text-night-muted">{d.registrationsCount} участников</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.finalistGroups.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Финалисты</h2>
          <div className="stack gap-3">
            {view.finalistGroups.map((g, idx) => (
              <div key={idx}>
                <p className="m-0 mb-1 text-xs uppercase tracking-wide text-night-muted">
                  {g.divisionCategoryName} · {g.roundLabel}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(["LEADER", "FOLLOWER"] as const).map((role) => {
                    const rows = g.rows.filter((r) => r.role === role);
                    if (rows.length === 0) return null;
                    return (
                      <div key={role}>
                        <p className="m-0 text-[0.72rem] text-night-muted">{REGISTRATION_ROLE_LABELS[role]}</p>
                        <ul className="m-0 list-none p-0 text-sm text-night-text">
                          {rows.map((r) => (
                            <li key={`${r.bibNumber}-${r.displayName}`}>
                              №{r.bibNumber ?? "—"} {r.displayName}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.resultsPublished && view.results.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Результаты</h2>
          <div className="stack gap-3">
            {[...new Set(view.results.map((r) => r.divisionCategoryName))].map((categoryName) => (
              <div key={categoryName}>
                <p className="m-0 mb-1 text-xs uppercase tracking-wide text-night-muted">{categoryName}</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["LEADER", "FOLLOWER"] as const).map((role) => {
                    const rows = view.results
                      .filter((r) => r.divisionCategoryName === categoryName && r.role === role)
                      .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999));
                    if (rows.length === 0) return null;
                    return (
                      <div key={role}>
                        <p className="m-0 text-[0.72rem] text-night-muted">{REGISTRATION_ROLE_LABELS[role]}</p>
                        <ul className="m-0 list-none p-0 text-sm text-night-text">
                          {rows.map((r) => (
                            <li key={`${r.bibNumber}-${r.displayName}`}>
                              {r.status === "FINALIST" ? `${r.placement ?? "—"} место` : "выбыл"} — №{r.bibNumber ?? "—"} {r.displayName}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.mediaUrl && (
        <a
          href={view.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-app border border-night-border bg-night-card py-3 text-center text-sm font-semibold text-night-accent no-underline"
        >
          📷 Фото и видео с соревнования →
        </a>
      )}
    </div>
  );
}
