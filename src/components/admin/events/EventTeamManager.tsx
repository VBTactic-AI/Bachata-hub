"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  MANAGER: "Менеджер",
  EDITOR: "Редактор",
  CHECK_IN: "Check-in",
  FINANCE: "Финансы",
};

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type EventTeamMemberRow = { id: string; role: string; user: { id: string; email: string } };

// Events Engine, этап 5 — минимальная команда события (см. комментарий у
// EventTeamMember в schema.prisma: все роли сегодня дают одинаковый
// эффективный доступ, role — пока только для отображения "кто есть кто").
// Добавление — по точному email (не автокомплит по каталогу пользователей,
// см. team-service.ts).
export function EventTeamManager({ eventSlug, initialMembers }: { eventSlug: string; initialMembers: EventTeamMemberRow[] }) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MANAGER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMember() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось добавить участника.");
      return;
    }
    const addedEmail = email.trim().toLowerCase();
    setEmail("");
    router.refresh();
    setMembers((prev) => [
      ...prev.filter((m) => m.user.email.toLowerCase() !== addedEmail),
      { id: data.member.id, role, user: { id: data.member.userId, email: addedEmail } },
    ]);
  }

  async function removeMember(userId: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/team/${userId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось убрать участника.");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* QA BUG-011: роль сегодня не даёт разных прав — все 4 варианта видят
          и меняют статус/оплату участников одинаково; название роли не
          обещает больше этого (например, "Редактор" НЕ даёт прав
          редактировать само событие). */}
      <p className="m-0 text-xs text-admin-muted">
        Роль пока влияет только на подпись в списке — все роли дают одинаковый доступ: просмотр участников и изменение их статуса/оплаты.
      </p>
      <div className="flex flex-wrap items-end gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
        <Label className="text-admin-muted">
          Email участника
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASS}
            style={{ maxWidth: 260 }}
          />
        </Label>
        <Label className="text-admin-muted">
          Роль
          <Select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD_CLASS} style={{ maxWidth: 180 }}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Button type="button" variant="adminOutline" disabled={loading || !email.trim()} onClick={addMember}>
          Добавить
        </Button>
      </div>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-admin-muted">В команде пока только вы (владелец события).</p>
      ) : (
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Роль</th>
                <th className="px-3 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-admin-border">
                  <td className="px-3 py-2 text-night-text">{m.user.email}</td>
                  <td className="px-3 py-2 text-admin-muted">{ROLE_LABELS[m.role] ?? m.role}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => removeMember(m.user.id)}
                      className="text-xs text-red-400 hover:underline disabled:opacity-50"
                    >
                      Убрать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
