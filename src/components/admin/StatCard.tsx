import { Card } from "@/components/ui/card";

// Переиспользуемая KPI-карточка (CLAUDE.md/задача redesign §21 — не плодить
// дубликаты инлайн-вёрстки) — используется на вкладках "Основное" и
// "Участники" страницы соревнования.
export function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className="border-admin-border bg-admin-card">
      <p className="m-0 text-sm text-admin-muted">{label}</p>
      <p className={`m-0 mt-1 text-2xl font-extrabold ${accent ? "text-admin-primaryHover" : "text-night-text"}`}>{value}</p>
    </Card>
  );
}
