// Общий клиентский кэш списка кандидатов в помощники, разделяемый между
// AddDrawHelperForm и (несколькими) ReplaceDrawHelperButton одного и того же
// захода/роли — раньше каждая кнопка грузила один и тот же
// GET /api/heats/[id]/helpers?role=... заново при каждом открытии (замечено
// пользователем, 2026-09-07: в заезде может быть несколько помощников одной
// роли, и открытие "заменить" на каждом грузило идентичный список повторно).
// Кэш модульного уровня — переживает router.refresh() (клиентские компоненты
// не размонтируются), но живёт только в пределах текущей загрузки страницы.
// Инвалидируется явно после успешного add/replace/remove — список кандидатов
// не бывает статичным дольше, чем между такими изменениями.

export type HelperCandidate = { id: string; displayName: string; bibNumber: string | null };

export type HelperCandidateGroup = {
  divisionId: string;
  categoryName: string;
  categoryOrder: number;
  isOwnDivision: boolean;
  registrations: HelperCandidate[];
};

export type HelperCandidatesResult = {
  suggestedRegistrationId: string | null;
  neededCount: number;
  divisions: HelperCandidateGroup[];
};

const cache = new Map<string, Promise<HelperCandidatesResult>>();

function cacheKey(heatId: string, role: string): string {
  return `${heatId}:${role}`;
}

export function fetchHelperCandidates(heatId: string, role: string): Promise<HelperCandidatesResult> {
  const key = cacheKey(heatId, role);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = fetch(`/api/heats/${heatId}/helpers?role=${role}`)
    .then((res) => res.json())
    .then((data): HelperCandidatesResult => {
      if (!data.ok) throw new Error(data.error || "Не удалось загрузить список кандидатов.");
      return {
        suggestedRegistrationId: data.suggestedRegistrationId ?? null,
        neededCount: data.neededCount ?? 1,
        divisions: data.divisions ?? [],
      };
    });

  cache.set(key, promise);
  // Ошибку не кэшируем — следующее открытие должно суметь повторить запрос.
  promise.catch(() => cache.delete(key));
  return promise;
}

export function invalidateHelperCandidates(heatId: string, role: string): void {
  cache.delete(cacheKey(heatId, role));
}
