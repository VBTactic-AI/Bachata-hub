"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { JudgeSearchBox } from "@/components/admin/JudgeSearchBox";
import { AddButton } from "@/components/admin/AddButton";
import { TrashIcon } from "@/components/admin/icons";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";

export type PoolJudge = { judgeUserId: string; judgeEmail: string; displayName: string | null };
type Role = "LEADER" | "FOLLOWER";

function judgeName(j: PoolJudge | undefined, fallbackId: string): string {
  return j?.displayName || j?.judgeEmail || fallbackId;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Судейская сетка дивизиона (redesign 2026-09-09, единый табличный стиль
// вкладки "Судьи", см. CLAUDE.md §64) — раньше две колонки чекбоксов
// (Партнёров/Партнёрш), теперь настоящая <table> (как "Участники"/
// справочники): одна строка = один назначенный судья + его роль. Изменение
// состава по-прежнему батчится (toggle → "Сохранить" одним диффом,
// setDivisionJudges) — ×  в строке снимает галочку локально, не удаляет
// сразу, ровно как раньше снятие чекбокса. Добавление нового (ещё не
// судившего это соревнование) человека — отдельное мгновенное действие
// (assignJudge), как и было.
export function DivisionJudgesPanel({
  divisionId,
  competitionId,
  pool,
  leaderJudgeUserIds,
  followerJudgeUserIds,
}: {
  divisionId: string;
  competitionId: string;
  pool: PoolJudge[];
  leaderJudgeUserIds: string[];
  followerJudgeUserIds: string[];
}) {
  const router = useRouter();
  const [leaders, setLeaders] = useState<Set<string>>(() => new Set(leaderJudgeUserIds));
  const [followers, setFollowers] = useState<Set<string>>(() => new Set(followerJudgeUserIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ре-синхронизация с сервером после router.refresh() (после "+ Судья",
  // после "Сохранить", а также после ЛЮБОГО другого router.refresh() на
  // странице) — см. подробное объяснение в истории этого файла (без этого
  // эффекта "+ Судья" молча не отражался, и "Сохранить" удаляло только что
  // назначенного судью).
  useEffect(() => setLeaders(new Set(leaderJudgeUserIds)), [leaderJudgeUserIds]);
  useEffect(() => setFollowers(new Set(followerJudgeUserIds)), [followerJudgeUserIds]);

  const poolById = new Map(pool.map((j) => [j.judgeUserId, j]));
  const rows = [
    ...[...leaders].map((judgeUserId) => ({ judgeUserId, role: "LEADER" as Role })),
    ...[...followers].map((judgeUserId) => ({ judgeUserId, role: "FOLLOWER" as Role })),
  ].sort((a, b) => judgeName(poolById.get(a.judgeUserId), a.judgeUserId).localeCompare(judgeName(poolById.get(b.judgeUserId), b.judgeUserId), "ru"));

  const hasChanges = !setsEqual(leaders, new Set(leaderJudgeUserIds)) || !setsEqual(followers, new Set(followerJudgeUserIds));

  function removeRow(role: Role, judgeUserId: string) {
    const setSet = role === "LEADER" ? setLeaders : setFollowers;
    setSet((prev) => {
      const next = new Set(prev);
      next.delete(judgeUserId);
      return next;
    });
  }

  function resetChanges() {
    setLeaders(new Set(leaderJudgeUserIds));
    setFollowers(new Set(followerJudgeUserIds));
    setError(null);
  }

  async function onSave() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/judges`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderJudgeUserIds: [...leaders], followerJudgeUserIds: [...followers] }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить судей.");
      return;
    }
    router.refresh();
  }

  // Уже назначенный куда-то в этом соревновании судья, ещё не в этой
  // категории — предлагаем сразу отметить, без формы "по email".
  const availableFromPool = pool.filter((j) => !leaders.has(j.judgeUserId) && !followers.has(j.judgeUserId));
  const [pickJudgeId, setPickJudgeId] = useState("");
  const [pickRole, setPickRole] = useState<Role>("LEADER");

  function addFromPool(e: React.FormEvent) {
    e.preventDefault();
    if (!pickJudgeId) return;
    const setSet = pickRole === "LEADER" ? setLeaders : setFollowers;
    setSet((prev) => new Set(prev).add(pickJudgeId));
    setPickJudgeId("");
  }

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("LEADER");
  const [addLoading, setAddLoading] = useState(false);

  // Новый (ещё нигде в этом соревновании не судивший) человек — отдельное
  // мгновенное действие: добавляет его сразу судьёй выбранной роли этого
  // дивизиона, дальше он появляется в общем пуле, как и остальные.
  async function onAddNew(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/judges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeEmail: newEmail, role: newRole }),
    });
    setAddLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить судью.");
      return;
    }
    setNewEmail("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm font-semibold text-night-text">
          Судьи категории <span className="font-normal text-admin-muted">({rows.length})</span>
        </p>
        <AddButton label="Изменить состав" gradientClassName="bg-gradient-admin-cta">
          <div className="flex flex-col gap-4">
            {availableFromPool.length > 0 && (
              <form onSubmit={addFromPool} className="flex flex-col gap-2">
                <p className="m-0 text-sm font-semibold text-night-text">Уже судит другую категорию</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Select value={pickJudgeId} onChange={(e) => setPickJudgeId(e.target.value)} className={FIELD_CLASS} style={{ maxWidth: 220 }}>
                    <option value="">Выберите судью…</option>
                    {availableFromPool.map((j) => (
                      <option key={j.judgeUserId} value={j.judgeUserId}>
                        {judgeName(j, j.judgeUserId)}
                      </option>
                    ))}
                  </Select>
                  <Select value={pickRole} onChange={(e) => setPickRole(e.target.value as Role)} className={FIELD_CLASS} style={{ maxWidth: 150 }}>
                    <option value="LEADER">Партнёров</option>
                    <option value="FOLLOWER">Партнёрш</option>
                  </Select>
                  <Button type="submit" size="sm" variant="adminOutline" disabled={!pickJudgeId}>
                    Добавить
                  </Button>
                </div>
              </form>
            )}

            <div className={availableFromPool.length > 0 ? "border-t border-admin-border pt-3" : ""}>
              <p className="m-0 mb-2 text-sm font-semibold text-night-text">Новый судья соревнования</p>
              <JudgeSearchBox competitionId={competitionId} onSelect={(j) => setNewEmail(j.email)} />
              <form onSubmit={onAddNew} className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-admin-muted">Email</span>
                  <Input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="judge@example.com"
                    className={FIELD_CLASS}
                    style={{ maxWidth: 220 }}
                  />
                </label>
                <Select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className={FIELD_CLASS} style={{ maxWidth: 150 }}>
                  <option value="LEADER">Партнёров</option>
                  <option value="FOLLOWER">Партнёрш</option>
                </Select>
                <Button type="submit" size="sm" variant="adminOutline" disabled={addLoading}>
                  + Судья
                </Button>
              </form>
            </div>
          </div>
        </AddButton>
      </div>

      {rows.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">Судьи пока не назначены.</p>
      ) : (
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">№</th>
                <th className="px-3 py-2 font-semibold">Судья</th>
                <th className="px-3 py-2 font-semibold">Судит</th>
                <th className="px-3 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const j = poolById.get(r.judgeUserId);
                const name = judgeName(j, r.judgeUserId);
                return (
                  <tr key={`${r.role}:${r.judgeUserId}`} className="border-t border-admin-border">
                    <td className="px-3 py-2.5 align-middle text-admin-muted">{i + 1}</td>
                    <td className="px-3 py-2.5 align-middle font-medium text-night-text">
                      {name}
                      {j?.displayName && <p className="m-0 text-xs font-normal text-admin-muted">{j.judgeEmail}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-admin-muted">{REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[r.role]}</td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeRow(r.role, r.judgeUserId)}
                          title="Убрать"
                          aria-label={`Убрать судью ${name}`}
                          className="text-admin-muted hover:text-red-400"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasChanges && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="admin" disabled={loading} onClick={onSave}>
            Сохранить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={resetChanges}
            className="border-admin-border bg-transparent text-night-text hover:bg-admin-card"
          >
            Отмена
          </Button>
          <span className="text-xs text-admin-muted">Изменения не сохранены</span>
        </div>
      )}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
