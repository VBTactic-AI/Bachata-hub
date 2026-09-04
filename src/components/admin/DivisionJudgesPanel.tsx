"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

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
      <p className="m-0 text-sm font-semibold">
        {title} <span className="text-muted font-normal">{checked.size}</span>
      </p>
      <div className="stack gap-1 mt-1">
        {pool.length === 0 && <p className="hint-text m-0">пока некого выбрать</p>}
        {pool.map((j) => (
          <label key={j.judgeUserId} className="flex items-center gap-1.5 text-sm cursor-pointer">
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
  pool,
  leaderJudgeUserIds,
  followerJudgeUserIds,
}: {
  divisionId: string;
  pool: PoolJudge[];
  leaderJudgeUserIds: string[];
  followerJudgeUserIds: string[];
}) {
  const router = useRouter();
  const [leaders, setLeaders] = useState<Set<string>>(() => new Set(leaderJudgeUserIds));
  const [followers, setFollowers] = useState<Set<string>>(() => new Set(followerJudgeUserIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="stack gap-2 mt-2">
      <p className="hint-text font-semibold m-0">Судьи</p>
      <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 480 }}>
        <JudgeColumn title="Судят ведущих" pool={pool} checked={leaders} onToggle={(id) => toggle("LEADER", id)} />
        <JudgeColumn title="Судят ведомых" pool={pool} checked={followers} onToggle={(id) => toggle("FOLLOWER", id)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={onSave}>
          Сохранить
        </Button>
        {error && <span className="error-text">{error}</span>}
      </div>
      <form onSubmit={onAddNew} className="flex flex-wrap items-end gap-2 pt-1 border-t border-line mt-1">
        <label className="stack gap-1">
          <span className="hint-text">Добавить нового судью (email)</span>
          <Input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="judge@example.com"
            className="max-w-[240px]"
          />
        </label>
        <Select value={newRole} onChange={(e) => setNewRole(e.target.value as "LEADER" | "FOLLOWER")} className="max-w-[160px]">
          <option value="LEADER">Ведущих</option>
          <option value="FOLLOWER">Ведомых</option>
        </Select>
        <Button type="submit" size="sm" variant="outline" disabled={addLoading}>
          + Судья
        </Button>
      </form>
    </div>
  );
}
