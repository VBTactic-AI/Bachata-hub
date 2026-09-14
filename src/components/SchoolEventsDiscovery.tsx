"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import Link from "next/link";
import type { EventFormat } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { OTHER_EVENTS_ID } from "@/lib/school-discovery-constants";
import type { DiscoveryEventGroups, SchoolDiscoveryData, SchoolDiscoveryEvent } from "@/lib/school-discovery";

// Интерактивный блок "Школы → события" на главной. История решений
// пользователя (2026-09-14/15):
// - карусель школ вверху страницы, "Сегодня"/"Ближайшие (1 неделя)" —
//   часть карусели, фильтруются по выбранной карточке;
// - "Другие события" — события без привязанной школы, отдельная псевдо-
//   карточка рядом с "Все школы" (не теряются при фильтрации по школам);
// - карточки минималистичные (только фото/лого + название);
// - закольцованная "фокусная" карусель: по центру всегда выбранная школа
//   (крупнее, с рамкой), по бокам — соседи (видно ~1.5 карточки с каждой
//   стороны), прокручивается кругом (после последней снова первая);
// - по клику — переход на страницу школы; выбор (центрирование через
//   стрелки/колесо/драг/клавиатуру) только показывает события ниже, сам по
//   себе никуда не ведёт.
const EVENT_FORMAT_LABEL: Record<EventFormat, string> = {
  PARTY: "Вечеринка",
  MASTERCLASS: "Мастер-класс",
  FESTIVAL: "Фестиваль",
  CONTEST: "Соревнование",
  INTENSIVE: "Интенсив",
};

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

// Размеры "фокусной" карусели: центр в 1.5 раза крупнее соседей (по прямому
// запросу пользователя, 2026-09-15). Ширина контейнера подобрана так, чтобы
// показывать ровно центр + по 1.5 карточки с каждой стороны (1 целая
// соседняя + половина следующей, обрезанная overflow:hidden контейнера).
const SIZES = {
  mobile: { center: 88, side: 56, gap: 8 },
  desktop: { center: 144, side: 96, gap: 12 },
};

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

export function SchoolEventsDiscovery({
  data,
  initialGroups,
}: {
  data: SchoolDiscoveryData;
  initialGroups: DiscoveryEventGroups;
}) {
  // Элементы карусели: 0 = "Все школы" (null), 1 = "Другие события", 2..n+1 = школы.
  const items = useMemo<(string | null)[]>(() => [null, OTHER_EVENTS_ID, ...data.schools.map((s) => s.id)], [data.schools]);
  const itemsCount = items.length;

  const [centerIndex, setCenterIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [groups, setGroups] = useState<DiscoveryEventGroups>(initialGroups);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [visible, setVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstRun = useRef(true);
  const dragRef = useRef<{ startX: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);
  const wheelAccum = useRef(0);
  // Во время драга положение карточек двигается напрямую через DOM (без
  // setState на каждый пиксель) — иначе React перерисовывал бы всю карусель
  // на каждое микро-движение пальца/мыши, что и давало заметную дёрганость
  // (жалоба пользователя, 2026-09-15). liveDragOffset — текущий сдвиг для
  // финального расчёта числа шагов при отпускании; slotElements — DOM-узлы
  // видимых слотов по их индексу, чтобы двигать именно их.
  const liveDragOffset = useRef(0);
  const slotElements = useRef<Map<number, HTMLElement>>(new Map());
  // Снимок centerIndex на момент pointerdown — клик сверяется с ним, а не с
  // "живым" centerIndex из замыкания рендера. На тач-устройствах браузер
  // сначала переводит фокус на элемент под пальцем (pointerdown → focus),
  // а onFocus здесь тоже центрирует карточку (goToIndex) — то есть к моменту
  // события click centerIndex мог уже успеть смениться на idx этой самой
  // карточки, и проверка "idx !== centerIndex" ошибочно решила бы, что
  // карточка уже была центральной, и пропустила бы переход по первому тапу
  // на ещё боковую карточку (жалоба пользователя, 2026-09-14: "можно
  // провалиться по клику, не только в центральную карточку").
  const pointerDownCenterIndex = useRef<number | null>(null);
  // Для "флика" на релизе (см. onPointerUp) — скорость движения указателя
  // непосредственно перед отпусканием.
  const velocityRef = useRef(0);
  const lastMoveSample = useRef<{ x: number; t: number } | null>(null);

  const activeId = items[centerIndex] ?? null;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const sizes = isMobile ? SIZES.mobile : SIZES.desktop;
  const neighbor1Offset = sizes.center / 2 + sizes.gap + sizes.side / 2;
  const neighbor2Offset = neighbor1Offset + sizes.side + sizes.gap;
  const containerWidth = neighbor2Offset * 2;
  const containerHeight = sizes.center;
  const dragStepPx = sizes.side + sizes.gap;

  function offsetForDistance(d: number) {
    if (d === 0) return 0;
    const magnitude = Math.abs(d) === 1 ? neighbor1Offset : neighbor2Offset;
    return d < 0 ? -magnitude : magnitude;
  }

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

  // Плавная смена событий (затухание, подмена данных, проявление —
  // 200-300ms), без анимационной библиотеки.
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

  // goToIndex — абсолютный переход (клик по конкретной карточке, идёт в
  // паре с уже известным idx, устаревшее замыкание тут не страшно).
  // shiftIndex — относительный шаг (стрелки/клавиатура/драг): специально
  // через функциональное обновление, а не "goToIndex(centerIndex ± 1)",
  // иначе быстрые повторные клики "←"/"→" (до перерисовки) читали бы одно и
  // то же устаревшее centerIndex из замыкания рендера и не накапливались бы
  // (тот же класс бага, что уже чинили в прошлой версии карусели на
  // scroll-detection, найдено вживую при проверке двойного клика "←").
  function goToIndex(i: number) {
    setCenterIndex((prev) => {
      const next = mod(i, itemsCount);
      return next === prev ? prev : next;
    });
  }
  function shiftIndex(delta: number) {
    setCenterIndex((prev) => mod(prev + delta, itemsCount));
  }
  function goPrev() {
    shiftIndex(-1);
  }
  function goNext() {
    shiftIndex(1);
  }

  function onContainerKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  }

  // Прокрутка колесом мыши (по прямому запросу пользователя) — переводим
  // вертикальный delta в шаг карусели. Слушатель добавлен нативно (не через
  // JSX onWheel): React вешает onWheel как passive, preventDefault() в нём
  // тихо игнорируется браузером.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      wheelAccum.current += e.deltaY;
      const threshold = 60;
      if (Math.abs(wheelAccum.current) >= threshold) {
        const dir = wheelAccum.current > 0 ? 1 : -1;
        setCenterIndex((prev) => mod(prev + dir, itemsCount));
        wheelAccum.current = 0;
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [itemsCount]);

  // Драг/свайп — карусель больше не является нативно скроллящимся
  // элементом (виртуальная раскладка вокруг центра), поэтому и мышь, и тач
  // обрабатываются одним и тем же способом. touchAction: none на
  // контейнере — с "pan-y" (разрешить браузеру вертикальный скролл)
  // мобильный жест иногда прерывался нативной прокруткой страницы
  // (браузер "перехватывал" смахивание с небольшим вертикальным
  // отклонением и присылал pointercancel вместо pointermove), из-за чего
  // карусель визуально "убегала" в случайное место — найдено пользователем
  // вживую на телефоне, 2026-09-15. Ширина карусели небольшая (не во всю
  // ширину экрана), поэтому потеря вертикального скролла именно над ней —
  // приемлемый компромисс ради предсказуемого горизонтального жеста.
  // setPointerCapture() откладывается до момента, когда движение реально
  // распознано как драг (>4px) — если захватывать указатель сразу на
  // pointerdown для ЛЮБОГО клика, браузер иногда не доводит обычный click
  // до <Link> карточки школы (клик по уже выбранной центральной карточке
  // не переходил на страницу школы — найдено пользователем вживую,
  // 2026-09-15; тот же класс бага уже чинили в предыдущей версии карусели).
  function onPointerDown(e: PointerEvent) {
    dragRef.current = { startX: e.clientX, moved: false, pointerId: e.pointerId };
    pointerDownCenterIndex.current = centerIndex;
    velocityRef.current = 0;
    lastMoveSample.current = { x: e.clientX, t: e.timeStamp };
  }

  function onPointerMove(e: PointerEvent) {
    const state = dragRef.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > 4) {
      state.moved = true;
      setIsDragging(true);
      // setPointerCapture может бросить (например, если браузер уже считает
      // этот pointerId неактивным к этому моменту) — без try/catch это
      // прервало бы остаток обработчика и потеряло бы первый кадр драга.
      try {
        containerRef.current?.setPointerCapture(state.pointerId);
      } catch {
        // не критично: драг продолжит работать и без захвата указателя.
      }
    }
    if (!state.moved) return;
    liveDragOffset.current = dx;
    // Мгновенная скорость (px/ms) для распознавания "флика" на релизе —
    // сглаживаем через последнюю пару замеров, а не среднее за весь жест,
    // чтобы резкое замедление пальца в конце свайпа не давало ложный флик.
    const last = lastMoveSample.current;
    if (last) {
      const dt = e.timeStamp - last.t;
      if (dt > 0) velocityRef.current = (e.clientX - last.x) / dt;
    }
    lastMoveSample.current = { x: e.clientX, t: e.timeStamp };
    // Прямое обновление transform DOM-узлов, минуя React state — драг
    // должен успевать за пальцем/мышью на каждый кадр, а не на каждый
    // ре-рендер компонента.
    for (const { idx, d } of slots) {
      const el = slotElements.current.get(idx);
      if (!el) continue;
      el.style.transform = `translate(-50%, -50%) translateX(${offsetForDistance(d) + dx}px)`;
    }
  }

  function onPointerUp() {
    const state = dragRef.current;
    if (state?.moved) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      let steps = Math.round(-liveDragOffset.current / dragStepPx);
      // Короткий быстрый жест (типичный "флик" пальцем на телефоне — палец
      // физически не проходит ту же дистанцию, что мышь на десктопе) может
      // не дотянуть до dragStepPx и округлиться в 0 шагов, хотя по скорости
      // это явно свайп с намерением перелистнуть. Порог подобран эмпирически
      // (0.5 px/ms ≈ обычный уверенный свайп, не задевает случайные дрожания
      // при попытке тапнуть). Жалоба пользователя, 2026-09-14: свайп на
      // мобильном не крутит карусель "как в полной версии" (на десктопе
      // мышью легко тянуть на бОльшую дистанцию, чем требует thumb-флик).
      const FLICK_VELOCITY_PX_MS = 0.5;
      if (steps === 0 && Math.abs(velocityRef.current) > FLICK_VELOCITY_PX_MS) {
        steps = velocityRef.current > 0 ? -1 : 1;
      }
      if (steps !== 0) shiftIndex(steps);
    }
    dragRef.current = null;
    liveDragOffset.current = 0;
    velocityRef.current = 0;
    lastMoveSample.current = null;
    setIsDragging(false);
  }

  // По клику — переход на страницу школы (уточнено пользователем,
  // 2026-09-15, уточнено: "по клику на ВЫДЕЛЕННУЮ сущность — провалиться в
  // неё"): переход на страницу школы — только по клику на уже
  // центральную/выбранную карточку. Клик по боковой (ещё не выбранной)
  // карточке — только выбирает её (centerIndex), без перехода, это то же
  // самое действие, что делают стрелки/колесо/драг/клавиатура. Также
  // перехватываем клик сразу после драга (иначе отпускание пальца/мыши
  // после свайпа само по себе засчиталось бы кликом).
  function onCardClickCapture(e: MouseEvent, idx: number) {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Сверяемся со снимком centerIndex на момент pointerdown, а не с
    // текущим состоянием (см. комментарий у pointerDownCenterIndex) — иначе
    // на тач-устройствах успевший отработать onFocus мог бы задним числом
    // "подтвердить" ещё боковую карточку как уже центральную.
    const referenceCenter = pointerDownCenterIndex.current ?? centerIndex;
    pointerDownCenterIndex.current = null;
    if (idx !== referenceCenter) {
      e.preventDefault();
      e.stopPropagation();
      goToIndex(idx);
    }
  }

  const activeSchool = activeId && activeId !== OTHER_EVENTS_ID ? data.schools.find((s) => s.id === activeId) : null;
  const isEmpty = groups.today.length === 0 && groups.thisWeek.length === 0;

  // Видимые слоты: центр + ближайшие 2 соседа с каждой стороны (контейнер
  // обрежет второго соседа ровно наполовину — "1.5 карточки по бокам").
  // Порядок обхода — от центра наружу, чтобы при малом числе элементов
  // (закольцованных) дубликаты индексов отбрасывались в пользу меньшей
  // дистанции до центра.
  const slots = useMemo(() => {
    const order = [0, -1, 1, -2, 2];
    const seen = new Set<number>();
    const result: { idx: number; d: number }[] = [];
    for (const d of order) {
      const idx = mod(centerIndex + d, itemsCount);
      if (seen.has(idx)) continue;
      seen.add(idx);
      result.push({ idx, d });
    }
    return result;
  }, [centerIndex, itemsCount]);

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
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              aria-label={t.schoolDiscovery.prevSchool}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-night-border bg-night-card/90 text-night-text backdrop-blur-md hover:border-night-primary/60 sm:flex"
            >
              ←
            </button>

            {
              // overflow-x-hidden (не overflow-hidden) — контейнеру нужно
              // обрезать боковых соседей по горизонтали (задумано как "видно
              // ~1.5 карточки", раньше не обрезалось вовсе — соседи
              // отображались целиком, найдено визуально при проверке),
              // но НЕ обрезать по вертикали: containerHeight равен высоте
              // центральной карточки без запаса, а у неё есть свечение
              // (box-shadow с blur) при выборе — overflow-hidden срезал бы
              // его плоско сверху/снизу.
            }
            <div
              ref={containerRef}
              role="listbox"
              aria-label={t.schoolDiscovery.title}
              tabIndex={0}
              onKeyDown={onContainerKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ width: containerWidth, height: containerHeight, touchAction: "none" }}
              className="relative shrink-0 select-none overflow-x-hidden cursor-grab active:cursor-grabbing"
            >
              {slots.map(({ idx, d }) => {
                const id = items[idx];
                const isCenter = d === 0;
                const size = isCenter ? sizes.center : sizes.side;
                const x = offsetForDistance(d);
                const registerSlotEl = (el: HTMLElement | null) => {
                  if (el) slotElements.current.set(idx, el);
                  else slotElements.current.delete(idx);
                };
                const style: CSSProperties = {
                  width: size,
                  height: size,
                  transform: `translate(-50%, -50%) translateX(${x}px)`,
                  zIndex: isCenter ? 20 : 10 - Math.abs(d),
                  transitionDuration: isDragging ? "0ms" : "320ms",
                };
                const baseClass =
                  // [-webkit-tap-highlight-color:transparent] — на тач-
                  // устройствах браузер иначе на каждый тап мигает своим
                  // прямоугольником поверх карточки поверх нашей плавной
                  // CSS-анимации выбора, что и ощущается как "дёрганость"
                  // (жалоба пользователя на недостаточную плавность,
                  // 2026-09-14).
                  "absolute left-1/2 top-1/2 flex flex-col items-center justify-center overflow-hidden rounded-app-sm border p-1.5 text-center transition-[transform,opacity,box-shadow] ease-brand no-underline [-webkit-tap-highlight-color:transparent]";
                const stateClass = isCenter
                  ? "border-night-primary opacity-100 shadow-[0_0_0_1px_rgba(255,45,138,0.45),0_16px_32px_-12px_rgba(255,45,138,0.6)]"
                  : "border-white/10 opacity-70 hover:opacity-90";

                if (id === null) {
                  return (
                    <button
                      key="all"
                      type="button"
                      ref={registerSlotEl}
                      role="option"
                      aria-selected={isCenter}
                      onClickCapture={(e) => onCardClickCapture(e, idx)}
                      onFocus={() => goToIndex(idx)}
                      style={style}
                      className={`${baseClass} ${stateClass} bg-gradient-night-cta`}
                    >
                      <span className="text-lg text-white" aria-hidden="true">
                        ✦
                      </span>
                      <span className="line-clamp-2 text-[0.62rem] font-semibold leading-tight text-white">
                        {t.schoolDiscovery.allSchoolsTitle}
                      </span>
                    </button>
                  );
                }

                if (id === OTHER_EVENTS_ID) {
                  return (
                    <button
                      key="other"
                      type="button"
                      ref={registerSlotEl}
                      role="option"
                      aria-selected={isCenter}
                      onClickCapture={(e) => onCardClickCapture(e, idx)}
                      onFocus={() => goToIndex(idx)}
                      style={style}
                      className={`${baseClass} ${stateClass} bg-night-card2`}
                    >
                      <span className="text-lg text-night-pink" aria-hidden="true">
                        ⋯
                      </span>
                      <span className="line-clamp-2 text-[0.62rem] font-semibold leading-tight text-night-text">
                        {t.schoolDiscovery.otherEventsTitle}
                      </span>
                    </button>
                  );
                }

                const school = data.schools.find((s) => s.id === id);
                if (!school) return null;
                return (
                  <Link
                    key={school.id}
                    href={`/schools/${school.slug}`}
                    ref={registerSlotEl}
                    role="option"
                    aria-selected={isCenter}
                    onClickCapture={(e) => onCardClickCapture(e, idx)}
                    onFocus={() => goToIndex(idx)}
                    style={style}
                    className={`${baseClass} ${stateClass} group p-0`}
                  >
                    <div
                      className={`h-full w-full bg-gradient-night-hero bg-cover bg-center transition-[filter] duration-300 ease-out ${
                        isCenter ? "brightness-110" : "brightness-90"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-1.5 pb-1.5 pt-4">
                      <span className="block truncate text-center text-[0.62rem] font-semibold leading-tight text-white">{school.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goNext}
              aria-label={t.schoolDiscovery.nextSchool}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-night-border bg-night-card/90 text-night-text backdrop-blur-md hover:border-night-primary/60 sm:flex"
            >
              →
            </button>
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
