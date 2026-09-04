export function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-app border border-night-border bg-night-card p-3">
      <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[0.72rem] uppercase tracking-wide text-night-muted">{label}</p>
        <p className="m-0 mt-0.5 text-sm font-medium text-night-text">{value}</p>
      </div>
    </div>
  );
}
