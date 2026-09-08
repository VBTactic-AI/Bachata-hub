"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { JudgeSearchBox } from "@/components/admin/JudgeSearchBox";

export type PoolJudge = { judgeUserId: string; judgeEmail: string };

function JudgeColumn({
  title,
  pool,
  checked,
  onToggle,
}: {
  title: string;
  pool: PoolJudge[];
  checked: Set<string>;
  onToggle: (judgeUserId: string) => void;
}) {
  return (
    <div>
      <p className="m-0 text-sm font-semibold text-night-text">
        {title} <span className="font-normal text-admin-muted">{checked.size}</span>
      </p>
      <div className="mt-1 flex flex-col gap-1">
        {pool.length === 0 && <p className="m-0 text-sm text-admin-muted">пока некого выбрать</p>}
        {pool.map((j) => (
          <label key={j.judgeUserId} className="flex cursor-pointer items-center gap-1.5 text-sm text-admin-muted">
            <input type="checkbox" checked={checked.has(j.judgeUserId)} onChange={() => onToggle(j.judgeUserId)} />
            {j.judgeEmail}
          </label>
        ))}
      </div>
    </div>
  );
}

// Судейская сетка дивизиона — по образцу двух колонок захода
// (DrawParticipantsGrid): слева судят ведущих, справа ведомых, галочки из
// общего пула судей соревнования (кто уже назначен хоть куда-то), одно
// "Сохранить" на весь дифф сразу (по запросу пользователя, 2026-09-04,
// заменяет прежний интерфейс добавления/удаления судей по одному).
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
  // после "Сохранить" самой этой панели, а также после ЛЮБОГО другого
  // router.refresh() на странице, например после check-in) — useState с
  // ленивым инициализатором выше запускается только при первом монтировании
  // и НЕ обновляется, когда родитель передаёт новые props после серверного
  // ре-рендера. Без этого эффекта "+ Судья" молча не отражался в чекбоксах,
  // и последующий клик "Сохранить" удалял только что назначенного судью,
  // считая присланный набор checked ПОЛНЫМ желаемым состоянием
  // (setDivisionJudges udаляет всех, кого нет в списке).
  useEffect(() => {
    setLeaders(new Set(leaderJudgeUserIds));
  }, [leaderJudgeUserIds]);
  useEffect(() => {
    setFollowers(new Set(followerJudgeUserIds));
  }, [followerJudgeUserIds]);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"LEADER" | "FOLLOWER">("LEADER");
  const [addLoading, setAddLoading] = useState(false);

  function toggle(side: "LEADER" | "FOLLOWER", judgeUserId: string) {
    const [set, setSet] = side === "LEADER" ? [leaders, setLeaders] : [followers, setFollowers];
    const next = new Set(set);
    if (next.has(judgeUserId)) next.delete(judgeUserId);
    else next.add(judgeUserId);
    setSet(next);
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

  // Новый (ещё нигде в этом соревновании не судивший) человек — отдельное
  // мгновенное действие: добавляет его сразу судьёй выбранной роли этого
  // дивизиона, дальше он появляется в общем пуле галочками, как и остальные.
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
    <div className="mt-2 flex flex-col gap-2">
      <p className="m-0 text-sm font-semibold text-admin-muted">Судьи</p>
      <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 480 }}>
        <JudgeColumn title="Судят Партнёров" pool={pool} checked={leaders} onToggle={(id) => toggle("LEADER", id)} />
        <JudgeColumn title="Судят Партнёрш" pool={pool} checked={followers} onToggle={(id) => toggle("FOLLOWER", id)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={loading} onClick={onSave}>
          Сохранить
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
      <div className="mt-1 border-t border-admin-border pt-1">
        <JudgeSearchBox competitionId={competitionId} onSelect={(j) => setNewEmail(j.email)} />
      </div>
      <form onSubmit={onAddNew} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-admin-muted">Добавить нового судью (email)</span>
          <Input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="judge@example.com"
            className="max-w-[240px] border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          />
        </label>
        <Select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as "LEADER" | "FOLLOWER")}
          className="max-w-[160px] border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
        >
          <option value="LEADER">Партнёров</option>
          <option value="FOLLOWER">Партнёрш</option>
        </Select>
        <Button type="submit" size="sm" variant="adminOutline" disabled={addLoading}>
          + Судья
        </Button>
      </form>
    </div>
  );
}
