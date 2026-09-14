"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import Link from "next/link";
import type { EventFormat } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventTime, formatRelativeDayLabel, pluralizeRu } from "@/lib/format";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { VerificationBadge } from "@/components/VerificationBadge";
import { OTHER_EVENTS_ID } from "@/lib/school-discovery-constants";
import type { DiscoveryEventGroups, SchoolDiscoveryData, SchoolDiscoveryEvent } from "@/lib/school-discovery";

// Интерактивный блок "Школы → события" на главной (ТЗ пользователя,
// 2026-09-14, дополнено в тот же день: блок переехал наверх страницы,
// "Сегодня"/"Ближайшие (1 неделя)" стали частью карусели вместо отдельных
// безусловных секций; добавлена карточка "Другие события" для событий без
// привязанной школы — по прямому решению пользователя, чтобы такие события
// не выпадали из вида при фильтрации по школам).
//
// Карусель — CSS scroll-snap + немного React-логики (в проекте нет carousel-
// библиотеки, ТЗ явно разрешало обойтись без неё). Активная карточка
// определяется по фактическому положению скролла (debounce после остановки)
// и по фокусу с клавиатуры — клик по карточке реальной школы ведёт на её
// страницу, это отдельное действие от "пролистать и посмотреть события".
const EVENT_FORMAT_LABEL: Record<EventFormat, string> = {
  PARTY: "Вечеринка",
  MASTERCLASS: "Мастер-класс",
  FESTIVAL: "Фестиваль",
  CONTEST: "Соревнование",
  INTENSIVE: "Интенсив",
};

const CARD_WIDTH = "w-[78%] sm:w-[46%] md:w-[31%] lg:w-[23%] xl:w-[19%]";

function EventCard({ event }: { event: SchoolDiscoveryEvent }) {
  const startsAt = new Date(event.startsAt);
  const relativeDay = formatRelativeDayLabel(startsAt);

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-app border border-white/10 bg-night-card/75 no-underline backdrop-blur-md transition-colors hover:border-white/20 hover:bg-night-card2/85"
    >
      <div className="relative h-[120px] w-full shrink-0 overflow-hidden">
        <div
          className="h-full w-full bg-gradient-night-hero bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-110"
          style={event.photoUrl ? { backgroundImage: `url(${event.photoUrl})` } : undefined}
          aria-hidden="true"
        />
        <span
          className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: EVENT_FORMAT_COLOR[event.format] }}
        >
          {EVENT_FORMAT_LABEL[event.format]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <span className="line-clamp-2 text-[0.9rem] font-semibold leading-snug text-night-text">{event.title}</span>
        <span className="text-sm font-medium text-night-primary">
          {relativeDay ? `${relativeDay}, ` : ""}
          {formatEventTime(startsAt)}
        </span>
        <span className="truncate text-xs text-night-muted">
          {event.cityName}
          {event.schoolName ? ` · ${event.schoolName}` : ""}
        </span>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="truncate text-xs font-semibold text-night-text">{event.price ?? ""}</span>
          <span className="shrink-0 text-xs font-semibold text-night-primary">{t.common.details} →</span>
        </div>
      </div>
    </Link>
  );
}

function EventGroup({ title, events, emptyText }: { title: string; events: SchoolDiscoveryEvent[]; emptyText: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 font-night text-base font-bold text-night-text">{title}</h3>
      {events.length === 0 ? (
        <p className="m-0 text-sm text-night-muted">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SchoolEventsDiscovery({
  data,
  initialGroups,
}: {
  data: SchoolDiscoveryData;
  initialGroups: DiscoveryEventGroups;
}) {
  // null → "Все школы", OTHER_EVENTS_ID → "Другие события", иначе — id школы.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [groups, setGroups] = useState<DiscoveryEventGroups>(initialGroups);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [visible, setVisible] = useState(true);

  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstRun = useRef(true);
  const dragRef = useRef<{ startX: number; startScrollLeft: number; dragging: boolean; pointerId: number } | null>(null);
  const suppressScrollDetection = useRef(false);

  async function loadEvents(id: string | null) {
    setStatus("loading");
    try {
      const res = await fetch(`/api/school-events?schoolId=${id ?? "all"}`);
      if (!res.ok) throw new Error("bad status");
      const json = (await res.json()) as DiscoveryEventGroups;
      setGroups({ today: json.today ?? [], thisWeek: json.thisWeek ?? [] });
      setStatus("idle");
    } catch {
      setStatus("error");
    } finally {
      setVisible(true);
    }
  }

  // Плавная смена событий (п.13 ТЗ): затухание, подмена данных, проявление —
  // 200-300ms суммарно, без анимационной библиотеки.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setVisible(false);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      loadEvents(activeId);
    }, 220);
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Индексы карточек: 0 = "Все школы", 1 = "Другие события", 2..n+1 = школы.
  function idAtIndex(i: number): string | null {
    if (i === 0) return null;
    if (i === 1) return OTHER_EVENTS_ID;
    return data.schools[i - 2]?.id ?? null;
  }

  function currentIndex() {
    if (activeId === null) return 0;
    if (activeId === OTHER_EVENTS_ID) return 1;
    const idx = data.schools.findIndex((s) => s.id === activeId);
    return idx === -1 ? 0 : idx + 2;
  }

  function computeActiveFromScroll() {
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const centerX = trackRect.left + trackRect.width / 2;
    let bestIndex = 0;
    let bestDist = Infinity;
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - centerX);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    });
    const nextId = idAtIndex(bestIndex);
    setActiveId((prev) => (prev === nextId ? prev : nextId));
  }

  function handleScroll() {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      // Скролл, запущенный программно (клик/клавиатура), уже выставил
      // правильный activeId синхронно в selectIndex() — не даём этому же
      // скроллу, когда он долистает и уляжется, "исправить" выбор по своим
      // расчётам "ближайшая к центру". Без этого быстрые повторные клики
      // (например 2× "→" подряд) иногда откатывали выделение на 1 карточку
      // назад: новый scrollIntoView прерывал предыдущую анимацию, и итоговое
      // положение скролла не всегда точно совпадало с той карточкой, на
      // которую реально кликнули (найдено вживую, 2026-09-14).
      if (suppressScrollDetection.current) {
        suppressScrollDetection.current = false;
        return;
      }
      computeActiveFromScroll();
    }, 130);
  }

  function scrollToIndex(i: number) {
    cardRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // Кнопки/клавиатура выбирают карточку НАПРЯМУЮ (не полагаясь на то, что
  // scroll-based определение "по центру" случайно совпадёт с нужным
  // индексом) — у крайних карточек списка центрировать физически некуда, и
  // алгоритм "ближайшая к центру" в этом случае определял бы совсем другую
  // карточку, чем та, на которую реально перешли (найдено вживую при
  // проверке кнопки "→").
  function selectIndex(i: number) {
    const clamped = Math.max(0, Math.min(cardRefs.current.length - 1, i));
    const id = idAtIndex(clamped);
    suppressScrollDetection.current = true;
    setActiveId((prev) => (prev === id ? prev : id));
    scrollToIndex(clamped);
  }

  function goPrev() {
    selectIndex(currentIndex() - 1);
  }

  function goNext() {
    selectIndex(currentIndex() + 1);
  }

  function onTrackKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  }

  // Drag для мыши на десктопе (п.10 ТЗ) — тач-устройства скроллят нативно,
  // сюда не заходим (touch-action: pan-x на треке и так не конфликтует с
  // вертикальным скроллом страницы).
  //
  // track.setPointerCapture() вызывается НЕ на pointerdown, а только когда
  // движение реально распознано как drag (>4px) — раньше он вызывался сразу
  // на pointerdown для любого клика, из-за чего браузер иногда не доводил
  // обычный клик по карточке школы до её <Link> (клик "не проваливался" в
  // школу — баг пользователя, 2026-09-14, воспроизводился только на
  // десктопе, где есть mouse-drag; на тач-устройствах эта функция не
  // вызывается вовсе).
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "touch") return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = { startX: e.clientX, startScrollLeft: track.scrollLeft, dragging: false, pointerId: e.pointerId };
  }

  function onPointerMove(e: PointerEvent) {
    const state = dragRef.current;
    const track = trackRef.current;
    if (!state || !track) return;
    const dx = e.clientX - state.startX;
    if (!state.dragging && Math.abs(dx) > 4) {
      state.dragging = true;
      track.setPointerCapture(state.pointerId);
    }
    if (state.dragging) track.scrollLeft = state.startScrollLeft - dx;
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  // Клик по карточке реальной школы (п.14 ТЗ, уточнено пользователем,
  // 2026-09-14): одиночный клик выбирает школу активной (то же самое, что
  // уже делают скролл/фокус), двойной клик — переход на страницу школы.
  // Различаем через MouseEvent.detail: 0 — активация с клавиатуры
  // (Enter/Space на сфокусированной ссылке, не трогаем — должна работать
  // как обычная ссылка), 1 — первый клик мышью (перехватываем, только
  // выбор), 2+ — второй клик того же двойного клика (не перехватываем,
  // даём сработать обычной навигации по ссылке). Модификаторы
  // (Ctrl/Cmd/Shift/колёсико) не трогаем — должны открывать в новой вкладке
  // как обычная ссылка.
  function onSchoolCardClick(e: MouseEvent, schoolId: string) {
    if (e.detail === 0 || e.detail >= 2 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setActiveId(schoolId);
  }

  const activeSchool = activeId && activeId !== OTHER_EVENTS_ID ? data.schools.find((s) => s.id === activeId) : null;
  const isEmpty = groups.today.length === 0 && groups.thisWeek.length === 0;

  return (
    <section aria-label={t.schoolDiscovery.title} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="m-0 font-night text-lg font-bold text-night-text sm:text-xl">{t.schoolDiscovery.title}</h2>
          <p className="m-0 mt-0.5 text-sm text-night-muted">{t.schoolDiscovery.subtitle}</p>
        </div>
        <Link href="/schools" className="shrink-0 text-sm font-semibold text-night-primary no-underline hover:no-underline">
          {t.schoolDiscovery.seeAllSchools}
        </Link>
      </div>

      {data.schools.length === 0 ? (
        <p className="m-0 text-sm text-night-muted">{t.schoolDiscovery.noSchools}</p>
      ) : (
        <>
          <div className="relative">
            {/* Стрелки — только на десктопе (п.9 ТЗ), на мобильном достаточно свайпа */}
            <button
              type="button"
              onClick={goPrev}
              aria-label={t.schoolDiscovery.prevSchool}
              className="absolute -left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-night-border bg-night-card/90 text-night-text backdrop-blur-md hover:border-night-primary/60 sm:flex"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t.schoolDiscovery.nextSchool}
              className="absolute -right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-night-border bg-night-card/90 text-night-text backdrop-blur-md hover:border-night-primary/60 sm:flex"
            >
              →
            </button>

            <div
              ref={trackRef}
              role="listbox"
              aria-label={t.schoolDiscovery.title}
              tabIndex={0}
              onScroll={handleScroll}
              onKeyDown={onTrackKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              style={{ touchAction: "pan-x" }}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 pb-1 pl-4 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] select-none cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden sm:scroll-px-10 sm:pl-10 sm:pr-10"
            >
              {/* Псевдо-карточка "Все школы" — всегда первая (п.4/п.36 ТЗ) */}
              <button
                type="button"
                ref={(el) => {
                  cardRefs.current[0] = el;
                }}
                role="option"
                aria-selected={activeId === null}
                onClick={() => selectIndex(0)}
                onFocus={() => setActiveId(null)}
                className={`shrink-0 snap-center rounded-app border p-4 text-left transition-all duration-[250ms] ease-out ${CARD_WIDTH} ${
                  activeId === null
                    ? "scale-[1.02] border-night-primary bg-gradient-night-cta opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.4),0_20px_40px_-15px_rgba(255,45,138,0.5)]"
                    : "border-white/10 bg-night-card/75 opacity-80 hover:opacity-100"
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg" aria-hidden="true">
                  ✦
                </span>
                <h3 className="m-0 mt-3 font-night text-base font-bold text-white">{t.schoolDiscovery.allSchoolsTitle}</h3>
                <p className="m-0 mt-1 text-xs text-white/80">{t.schoolDiscovery.allSchoolsSubtitle}</p>
                <p className="m-0 mt-3 text-xs font-semibold text-white/90">
                  {data.totalSchools} {pluralizeRu(data.totalSchools, t.school.schoolsFoundCount)}
                  {" · "}
                  {data.totalUpcomingEvents} {pluralizeRu(data.totalUpcomingEvents, t.event.eventsFoundCount)}
                </p>
              </button>

              {/* Псевдо-карточка "Другие события" — события без привязанной школы
                  (по прямому решению пользователя, 2026-09-14) — визуально
                  отличается от "Все школы" (нейтральный фон вместо акцентного
                  градиента), чтобы не создавать впечатление второй "главной"
                  карточки. */}
              <button
                type="button"
                ref={(el) => {
                  cardRefs.current[1] = el;
                }}
                role="option"
                aria-selected={activeId === OTHER_EVENTS_ID}
                onClick={() => selectIndex(1)}
                onFocus={() => setActiveId(OTHER_EVENTS_ID)}
                className={`shrink-0 snap-center rounded-app border p-4 text-left transition-all duration-[250ms] ease-out ${CARD_WIDTH} ${
                  activeId === OTHER_EVENTS_ID
                    ? "scale-[1.02] border-night-primary bg-night-card2 opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.4),0_20px_40px_-15px_rgba(255,45,138,0.5)]"
                    : "border-white/10 bg-night-card/75 opacity-80 hover:opacity-100"
                }`}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-night-card2 text-lg text-night-pink"
                  aria-hidden="true"
                >
                  ⋯
                </span>
                <h3 className="m-0 mt-3 font-night text-base font-bold text-night-text">{t.schoolDiscovery.otherEventsTitle}</h3>
                <p className="m-0 mt-1 text-xs text-night-muted">{t.schoolDiscovery.otherEventsSubtitle}</p>
                <p className="m-0 mt-3 text-xs font-semibold text-night-muted">
                  {data.otherEventsCount} {pluralizeRu(data.otherEventsCount, t.event.eventsFoundCount)}
                </p>
              </button>

              {data.schools.map((school, i) => {
                const isActive = activeId === school.id;
                return (
                  <Link
                    key={school.id}
                    href={`/schools/${school.slug}`}
                    ref={(el) => {
                      cardRefs.current[i + 2] = el;
                    }}
                    role="option"
                    aria-selected={isActive}
                    onFocus={() => setActiveId(school.id)}
                    onClick={(e) => onSchoolCardClick(e, school.id)}
                    className={`group shrink-0 snap-center overflow-hidden rounded-app border no-underline transition-all duration-[250ms] ease-out hover:-translate-y-[3px] ${CARD_WIDTH} ${
                      isActive
                        ? "scale-[1.02] border-night-primary bg-night-card opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.4),0_20px_40px_-15px_rgba(255,45,138,0.5)]"
                        : "border-white/10 bg-night-card/75 opacity-80 hover:opacity-100"
                    }`}
                  >
                    <div className="relative h-[110px] w-full overflow-hidden">
                      <div
                        className={`h-full w-full bg-gradient-night-hero bg-cover bg-center transition-transform duration-300 ease-out group-hover:scale-[1.03] ${
                          isActive ? "brightness-110" : "brightness-90"
                        }`}
                        aria-hidden="true"
                      />
                      <div className="absolute left-2.5 top-2.5">
                        <VerificationBadge status={school.verificationStatus} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 p-3.5">
                      <h3 className={`m-0 truncate text-[0.95rem] font-semibold ${isActive ? "text-night-text" : "text-night-text/85"}`}>
                        {school.name}
                      </h3>
                      <p className="m-0 truncate text-xs text-night-muted">{school.cityName}</p>
                      {school.description && <p className="m-0 line-clamp-2 text-xs text-night-muted">{school.description}</p>}
                      {school.directions.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                          {school.directions.slice(0, 2).map((d) => (
                            <span key={d} className="rounded-full bg-night-card2 px-2 py-0.5 text-[0.68rem] font-semibold text-night-pink">
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-night-border pt-2">
                        <span className="truncate text-[0.72rem] text-night-muted">
                          {school.avgRating !== null ? `★ ${school.avgRating.toFixed(1)} · ` : ""}
                          {school.teachersCount} {pluralizeRu(school.teachersCount, ["преподаватель", "преподавателя", "преподавателей"])}
                        </span>
                        {/* Явный переход одним кликом (п.17 ТЗ) — stopPropagation,
                            чтобы клик не перехватывался onSchoolCardClick (там
                            одиночный клик по остальной карточке только выбирает
                            школу, переход — по двойному клику, по прямому
                            запросу пользователя, 2026-09-14). */}
                        <span
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 text-xs font-semibold text-night-primary"
                        >
                          {t.common.details} →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div
            className="flex flex-col gap-5 transition-opacity duration-200 ease-out"
            style={{ opacity: visible ? 1 : 0 }}
            aria-live="polite"
          >
            {status === "error" ? (
              <div className="flex flex-col items-start gap-2">
                <p className="m-0 text-sm text-night-muted">{t.schoolDiscovery.loadError}</p>
                <button
                  type="button"
                  onClick={() => loadEvents(activeId)}
                  className="rounded-full border border-night-border px-4 py-2 text-xs font-semibold text-night-text hover:border-night-primary"
                >
                  {t.common.retry}
                </button>
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-start gap-3">
                <p className="m-0 text-sm text-night-muted">
                  {activeSchool ? t.schoolDiscovery.emptyForSchool : t.schoolDiscovery.emptyForAll}
                </p>
                <div className="flex flex-wrap gap-3">
                  {activeSchool && (
                    <Link
                      href={`/schools/${activeSchool.slug}`}
                      className="rounded-full border border-night-border px-4 py-2 text-xs font-semibold text-night-text no-underline hover:border-night-primary hover:no-underline"
                    >
                      {t.schoolDiscovery.viewSchool}
                    </Link>
                  )}
                  <Link
                    href="/events"
                    className="rounded-full bg-gradient-night-cta px-4 py-2 text-xs font-semibold text-white no-underline hover:no-underline"
                  >
                    {t.schoolDiscovery.viewAllEvents}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <EventGroup title={t.home.today} events={groups.today} emptyText={t.home.noEventsToday} />
                <EventGroup title={t.home.thisWeek} events={groups.thisWeek} emptyText={t.home.noEventsWeek} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
