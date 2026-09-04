const STEPS = ["Данные", "Категории", "Подтверждение"];

export function RegistrationStepper({ current }: { current: number }) {
  return (
    <ol className="m-0 flex list-none items-center p-0">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i <= current ? "bg-gradient-night-cta text-white" : "border border-night-border bg-night-card text-night-muted"
              }`}
              aria-current={i === current ? "step" : undefined}
            >
              {i + 1}
            </span>
            <span className={`text-[0.68rem] ${i <= current ? "text-night-text" : "text-night-muted"}`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`mx-2 h-0.5 flex-1 ${i < current ? "bg-night-primary" : "bg-night-border"}`} />}
        </li>
      ))}
    </ol>
  );
}
