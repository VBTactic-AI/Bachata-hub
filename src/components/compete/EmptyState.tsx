export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-app border border-dashed border-night-border bg-night-card/50 p-8 text-center">
      <p className="m-0 text-night-text">{title}</p>
      {hint && <p className="m-0 mt-1 text-sm text-night-muted">{hint}</p>}
    </div>
  );
}
