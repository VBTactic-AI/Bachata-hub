"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import Link from "next/link";
import type { EventFormat } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
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
// Карточки реальных школ — квадратные и маленькие, только фото/название
// (по прямому запросу пользователя, 2026-09-14: "минимализм", "в разы 3
// меньше", один размер что на мобильном, что на десктопе — раньше карточка
// школы была ~290px на мобильном/~280px на десктопе, 96px даёт нужное
// уменьшение примерно в 3 раза на обоих). "Все школы"/"Другие события"
// сознательно оставлены как есть — другого размера (CARD_WIDTH), по прямому
// решению пользователя не трогать их.
const SCHOOL_CARD_SIZE = "h-24 w-24";

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

  // Прокрутка карусели колесом мыши (по прямому запросу пользователя,
  // 2026-09-14) — переводим вертикальный wheel-delta в горизонтальный скролл
  // трека. Слушатель добавлен нативно через addEventListener, а не через
  // JSX onWheel: React вешает onWheel как passive-листенер, в котором
  // preventDefault() тихо игнорируется браузером (нельзя было бы подавить
  // скролл страницы). На границах списка (уже проскроллено до конца в эту
  // сторону) событие НЕ перехватывается — колесо отдаётся странице, чтобы
  // не запирать вертикальный скролл сайта над каруселью.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const atStart = track!.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = track!.scrollLeft + track!.clientWidth >= track!.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      track!.scrollLeft += e.deltaY;
    }
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, []);

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
          <div>
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
              className="flex items-start snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 scroll-pr-4 pb-1 pl-4 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] select-none cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:hidden sm:scroll-pl-12 sm:scroll-pr-12"
            >
              {/* Стрелки — только на десктопе (п.9 ТЗ), на мобильном достаточно
                  свайпа. Внутри трека, а не абсолютно поверх него — position:
                  sticky на первом/последнем flex-элементе скроллящегося
                  контейнера сама "прилипает" к видимому краю ТОЛЬКО пока есть
                  что скроллить; если карточек не хватает на всю ширину, стрелка
                  просто остаётся в потоке сразу после последней карточки, а не
                  висит в пустоте у края колонки (по прямому запросу
                  пользователя, 2026-09-15) — без замера overflow через JS. */}
              <button
                type="button"
                onClick={goPrev}
                aria-label={t.schoolDiscovery.prevSchool}
                className="sticky left-0 z-10 hidden h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border border-night-border bg-night-card/90 text-night-text backdrop-blur-md hover:border-night-primary/60 sm:flex"
              >
                ←
              </button>

              {/* Псевдо-карточка "Все школы" — всегда первая (п.4/п.36 ТЗ).
                  Тот же размер и минимализм, что у карточек школ (по прямому
                  запросу пользователя, 2026-09-14) — иконка + короткая
                  подпись, без статистики. */}
              <button
                type="button"
                ref={(el) => {
                  cardRefs.current[0] = el;
                }}
                role="option"
                aria-selected={activeId === null}
                onClick={() => selectIndex(0)}
                onFocus={() => setActiveId(null)}
                className={`flex shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-app-sm border p-2 text-center transition-all duration-[250ms] ease-out ${SCHOOL_CARD_SIZE} ${
                  activeId === null
                    ? "scale-[1.05] border-night-primary bg-gradient-night-cta opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.4),0_12px_24px_-10px_rgba(255,45,138,0.5)]"
                    : "border-white/10 bg-gradient-night-cta opacity-80 hover:opacity-100"
                }`}
              >
                <span className="text-lg text-white" aria-hidden="true">
                  ✦
                </span>
                <span className="line-clamp-2 text-[0.66rem] font-semibold leading-tight text-white">{t.schoolDiscovery.allSchoolsTitle}</span>
              </button>

              {/* Псевдо-карточка "Другие события" — события без привязанной школы
                  (по прямому решению пользователя, 2026-09-14) — визуально
                  отличается от "Все школы" (нейтральный фон вместо акцентного
                  градиента), чтобы не создавать впечатление второй "главной"
                  карточки. Тот же размер/минимализм, что у карточек школ. */}
              <button
                type="button"
                ref={(el) => {
                  cardRefs.current[1] = el;
                }}
                role="option"
                aria-selected={activeId === OTHER_EVENTS_ID}
                onClick={() => selectIndex(1)}
                onFocus={() => setActiveId(OTHER_EVENTS_ID)}
                className={`flex shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-app-sm border p-2 text-center transition-all duration-[250ms] ease-out ${SCHOOL_CARD_SIZE} ${
                  activeId === OTHER_EVENTS_ID
                    ? "scale-[1.05] border-night-primary bg-night-card2 opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.4),0_12px_24px_-10px_rgba(255,45,138,0.5)]"
                    : "border-white/10 bg-night-card2 opacity-80 hover:opacity-100"
                }`}
              >
                <span className="text-lg text-night-pink" aria-hidden="true">
                  ⋯
                </span>
                <span className="line-clamp-2 text-[0.66rem] font-semibold leading-tight text-night-text">
                  {t.schoolDiscovery.otherEventsTitle}
                </span>
              </button>

              {/* Карточки реальных школ — минимализм (по прямому запросу
                  пользователя, 2026-09-14): только фото/лого и название,
                  квадратные и маленькие. Логотипа/обложки школа не хранит
                  (нет такого поля в схеме) — как и раньше, градиент-
                  плейсхолдер вместо выдуманного фото. */}
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
                    className={`group relative shrink-0 snap-center overflow-hidden rounded-app-sm border no-underline transition-all duration-[250ms] ease-out ${SCHOOL_CARD_SIZE} ${
                      isActive
                        ? "scale-[1.05] border-night-primary opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.4),0_12px_24px_-10px_rgba(255,45,138,0.5)]"
                        : "border-white/10 opacity-80 hover:opacity-100"
                    }`}
                  >
                    <div
                      className={`h-full w-full bg-gradient-night-hero bg-cover bg-center transition-transform duration-300 ease-out group-hover:scale-105 ${
                        isActive ? "brightness-110" : "brightness-90"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-1.5 pb-1.5 pt-4">
                      <span className="block truncate text-center text-[0.66rem] font-semibold leading-tight text-white">{school.name}</span>
                    </div>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={goNext}
                aria-label={t.schoolDiscovery.nextSchool}
                className="sticky right-0 z-10 hidden h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border border-night-border bg-night-card/90 text-night-text backdrop-blur-md hover:border-night-primary/60 sm:flex"
              >
                →
              </button>
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
