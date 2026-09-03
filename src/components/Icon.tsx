// Крошечные инлайн-иконки для строк с датой/местом на карточках событий и
// школ — вместо иконочного шрифта/библиотеки (лишний запрос, лишний вес).
// Каждая — по сути одна SVG-путь, наследует цвет через currentColor.
type IconProps = { size?: number };

export function CalendarIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8.5H17" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 2.5V5.5M13.5 2.5V5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PinIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 17.5s5.5-4.83 5.5-9.17A5.5 5.5 0 0 0 4.5 8.33C4.5 12.67 10 17.5 10 17.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8.2" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function TicketIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 8.2a2 2 0 0 0 0-3.9V3.5h14v0.8a2 2 0 0 0 0 3.9v0a2 2 0 0 0 0 3.9v0.8H3v-0.8a2 2 0 0 0 0-3.9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M11.5 4V13" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.6 1.6" />
    </svg>
  );
}
