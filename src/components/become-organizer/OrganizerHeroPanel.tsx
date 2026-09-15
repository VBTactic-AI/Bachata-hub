// Левая панель "Стать организатором" (редизайн 2026-09-16, по прямому
// запросу пользователя — макет согласован в артефакте перед реализацией).
// Чисто статичная презентационная часть, без пропсов — держит бренд-посыл
// одинаковым на всех шагах BecomeOrganizerWizard (выбор роли/форма/успех),
// поэтому вынесена отдельным компонентом, а не разметкой внутри шагов.
//
// На мобильных — сокращённая версия (только бейдж + заголовок + короткое
// описание, без списка преимуществ и тэглайна): это функциональный шаг
// визарда, а не маркетинговый лендинг, места на телефоне мало, а форма
// важнее декоративной части.
export function OrganizerHeroPanel() {
  return (
    <div
      className="relative flex flex-col overflow-hidden border-b border-night-border px-6 py-8 sm:px-8 sm:py-10 lg:border-b-0 lg:border-r lg:px-9 lg:py-11"
      style={{
        background:
          "radial-gradient(120% 90% at 25% 10%, rgba(255,45,138,0.40) 0%, transparent 58%), radial-gradient(100% 80% at 85% 95%, rgba(108,43,255,0.32) 0%, transparent 62%), linear-gradient(165deg, #331629, #120a12)",
      }}
    >
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-night-primary/45 bg-night-primary/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-night-pink">
        Для организаторов
      </span>

      <h1 className="m-0 mt-4 font-night text-[28px] font-extrabold leading-[1.12] tracking-tight text-night-text sm:text-[32px] lg:text-[36px]">
        Стать организатором
        <br />
        на <span className="text-night-pink">Bachata Hub</span>
      </h1>

      <p className="m-0 mt-3.5 max-w-[38ch] text-sm leading-relaxed text-night-muted">
        Получите доступ к инструментам для проведения мероприятий, управления школой и развития своего бренда в мире бачаты.
      </p>

      <ul className="m-0 mt-6 hidden list-none flex-col gap-3.5 p-0 lg:flex">
        {FEATURES.map((f) => (
          <li key={f.label} className="flex items-center gap-3 text-sm text-[#ecdfe4]">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-night-primary/30 bg-night-primary/10 text-night-pink">
              {f.icon}
            </span>
            {f.label}
          </li>
        ))}
      </ul>

      <div className="mt-9 hidden items-center gap-3.5 lg:flex">
        <span className="font-night text-[22px] italic leading-[1.2] text-night-pink">
          Together we
          <br />
          dance bigger
        </span>
        <svg viewBox="0 0 200 64" className="h-16 flex-1" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="heroStreak" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ff2d8a" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ff9ac9" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ff2d8a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="52" x2="200" y2="4" stroke="url(#heroStreak)" strokeWidth="2" />
          <line x1="30" y1="60" x2="150" y2="20" stroke="url(#heroStreak)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </svg>
  );
}
function SupportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const FEATURES: { label: string; icon: React.ReactNode }[] = [
  { label: "Удобная система регистрации и билетов", icon: <CalendarIcon /> },
  { label: "Продвижение в сообществе Bachata Hub", icon: <TargetIcon /> },
  { label: "Аналитика и статистика", icon: <ChartIcon /> },
  { label: "Поддержка команды платформы", icon: <SupportIcon /> },
];
