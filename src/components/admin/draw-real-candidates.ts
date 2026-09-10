// Клиентский кэш кандидатов для ручного добавления реального участника —
// тот же приём, что и draw-helper-candidates.ts (модульный кэш, переживает
// router.refresh(), инвалидируется явно после add/remove).

export type RealCandidate = { id: string; displayName: string; bibNumber: string | null };
export type RealCandidatesResult = { registrations: RealCandidate[]; remainingSlots: number };

const cache = new Map<string, Promise<RealCandidatesResult>>();

function cacheKey(heatId: string, role: string): string {
  return `${heatId}:${role}`;
}

export function fetchRealCandidates(heatId: string, role: string): Promise<RealCandidatesResult> {
  const key = cacheKey(heatId, role);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = fetch(`/api/heats/${heatId}/real-participants?role=${role}`)
    .then((res) => res.json())
    .then((data): RealCandidatesResult => {
      if (!data.ok) throw new Error(data.error || "Не удалось загрузить список кандидатов.");
      return { registrations: data.registrations ?? [], remainingSlots: data.remainingSlots ?? 0 };
    });

  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

export function invalidateRealCandidates(heatId: string, role: string): void {
  cache.delete(cacheKey(heatId, role));
}
