import { Card } from "@/components/ui/card";
import type { NextUpItem } from "@/lib/competition-overview";

const DOT_CLASS: Record<NextUpItem["priority"], string> = {
  p1: "bg-red-400",
  p2: "bg-amber-400",
  p3: "bg-admin-primaryHover",
};

export function NextUpChecklist({ items }: { items: NextUpItem[] }) {
  return (
    <Card className="border-admin-border bg-admin-card">
      <p className="m-0 font-semibold text-night-text">Что дальше</p>
      {items.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Сейчас нет ничего, что требует решения организатора.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {items.map((item, i) => (
            // Обычный <a>, не next/link — см. FloorSpotlight.tsx.
            <a
              key={i}
              href={item.monitorHref}
              className="flex items-start gap-3 rounded-app-sm border border-admin-border bg-admin-card2 p-3.5 transition-colors hover:border-admin-primary/60"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[item.priority]}`} />
              <div>
                <p className="m-0 text-sm font-bold text-night-text">{item.title}</p>
                <p className="m-0 mt-0.5 text-[0.8rem] text-admin-muted">{item.detail}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
