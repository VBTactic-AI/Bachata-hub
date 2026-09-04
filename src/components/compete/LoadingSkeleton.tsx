export function CompetitionCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-app border border-night-border bg-night-card p-2.5">
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-app-sm bg-night-card2" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-night-card2" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-night-card2" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-night-card2" />
      </div>
    </div>
  );
}

export function CompetitionListSkeleton() {
  return (
    <div className="stack gap-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <CompetitionCardSkeleton key={i} />
      ))}
    </div>
  );
}
