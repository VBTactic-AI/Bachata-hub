import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InfoCard } from "@/components/compete/InfoCard";
import { CategoryProgressAccordion } from "@/components/compete/CategoryProgressAccordion";
import { getPublicCompetitionView } from "@/server/public/public-competition-view";
import { pluralizeRu } from "@/lib/format";

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

  // Ссылка на судейский экран — раньше её нигде не было в интерфейсе
  // (только прямой URL /judging/[competitionId], найдено на живом
  // тестировании 2026-09-05): судья, которого назначили в админке, не мог
  // сам найти дорогу на свой экран оценок.
  //
  // Все четыре запроса идут одной волной. "Моя регистрация" раньше ждала
  // dancer, а назначение судьёй — ещё и её, хотя обоим нужен только
  // user.id/competitionId: получалось три сетевых барьера подряд там, где
  // достаточно одного. Регистрацию ищем по userId через связь dancer, чтобы
  // не зависеть от dancer.id, полученного отдельным запросом.
  const [view, myRegistration, myJudgeAssignment] = await Promise.all([
    getPublicCompetitionView(id),
    user
      ? prisma.registration.findFirst({ where: { competitionId: id, dancer: { userId: user.id } } })
      : Promise.resolve(null),
    user
      ? prisma.judgeAssignment.findFirst({ where: { judgeUserId: user.id, division: { competitionId: id } } })
      : Promise.resolve(null),
  ]);
  if (!view) notFound();

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
        <InfoCard
          icon="🧑‍🤝‍🧑"
          label="Участников"
          value={`${view.stats.registrationsCount} (${view.stats.leadersCount} ${pluralizeRu(view.stats.leadersCount, ["партнёр", "партнёра", "партнёров"])} / ${view.stats.followersCount} ${pluralizeRu(view.stats.followersCount, ["партнёрша", "партнёрши", "партнёрш"])})`}
        />
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
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Категории</h2>
          <CategoryProgressAccordion
            items={view.divisions.map((d) => ({ id: d.id, categoryName: d.categoryName, registrationsCount: d.registrationsCount }))}
            progress={view.divisionProgress}
          />
        </div>
      )}

      {view.audienceVotes.some((v) => v.status !== "IDLE") && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">🏆 Приз зрительских симпатий</h2>
          <div className="flex flex-col gap-2">
            {view.audienceVotes
              .filter((v) => v.status !== "IDLE")
              .map((v) => (
                <Link
                  key={v.divisionId}
                  href={`/compete/${id}/vote/${v.divisionId}`}
                  className="flex items-center justify-between gap-2 rounded-app border border-night-border bg-night-card px-4 py-3 no-underline transition hover:border-night-primary"
                >
                  <span className="text-sm font-semibold text-night-text">{v.categoryName}</span>
                  <span className="text-xs font-semibold text-night-pink">
                    {v.status === "RUNNING" && "Идёт голосование →"}
                    {v.status === "CLOSED" && "Ждём публикации →"}
                    {v.status === "PUBLISHED" && "Результаты →"}
                  </span>
                </Link>
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
