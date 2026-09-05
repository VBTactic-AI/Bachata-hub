import { CompetitionListSkeleton } from "@/components/compete/LoadingSkeleton";

export default function CompeteLoading() {
  return (
    <div className="stack gap-4">
      <h1 className="font-night text-xl font-extrabold text-night-text">Соревнования</h1>
      <CompetitionListSkeleton />
    </div>
  );
}
