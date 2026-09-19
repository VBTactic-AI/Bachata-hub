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

export function ClockIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6V10L12.5 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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

export function ChevronLeftIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

export function PhoneIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4.5 3h2.6l1.2 3.4L7 8c.7 1.8 2 3.1 3.8 3.8l1.6-1.3 3.4 1.2v2.6c0 1-.8 1.8-1.8 1.7C8.4 15.4 4.6 11.6 4 6.1c-.1-1 .7-1.8 1.7-1.8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Избранное на карточке события (FollowButton variant="icon") — заполненная
// звезда, если fill="currentColor", контурная при fill="none".
export function StarIcon({ size = 15, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M10 2.5 12.3 7.6 18 8.3 13.8 12.1 15 17.5 10 14.6 5 17.5 6.2 12.1 2 8.3 7.7 7.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.3 6l6.7 5 6.7-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
