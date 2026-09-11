import Link from "next/link";
import type { City, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { VerificationBadge } from "./VerificationBadge";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";

type SchoolWithCity = School & { city: City };

// Тёмная карточка школы по макету JBJ Platform (экран "ШКОЛЫ",
// design/project/JBJ Platform.dc.html) — используется только в /schools, не
// шарится с другими (светлыми) страницами, поэтому переопределяем цвета
// прямо здесь через className (Card/Tag остаются общими, их файлы не
// трогаем — CLAUDE.md §54).
export function SchoolCard({ school }: { school: SchoolWithCity }) {
  return (
    <Card
      interactive
      className="group flex flex-row items-start gap-3.5 border-night-border bg-night-card p-3 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0 hover:scale-[1.05] hover:border-night-primary/60 hover:shadow-[0_25px_50px_-15px_rgba(0,0,0,0.6)]"
    >
      <div className="h-[66px] w-[66px] shrink-0 overflow-hidden rounded-app-sm">
        <div
          className="h-full w-full bg-gradient-night-hero bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-110"
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <VerificationBadge status={school.verificationStatus} />
        <h3 className="m-0 mt-1.5 truncate font-night text-[0.95rem] font-semibold text-night-text">
          <Link href={`/schools/${school.slug}`} className="text-night-text no-underline hover:text-night-text hover:no-underline">
            {school.name}
          </Link>
        </h3>
        <p className="m-0 mt-0.5 text-[0.8rem] text-night-muted">{school.city.nameRu}</p>
        {school.directions.length > 0 && (
          <p className="m-0 mt-1.5">
            {school.directions.map((d) => (
              <Tag key={d} className="mb-0 mr-1.5 bg-night-card2 text-[0.72rem] text-night-pink">
                {d}
              </Tag>
            ))}
          </p>
        )}
      </div>
      <Link
        href={`/schools/${school.slug}`}
        aria-label={`${t.common.details} ${school.name}`}
        className="shrink-0 self-center text-lg text-night-primary no-underline hover:text-night-primary hover:no-underline"
      >
        →
      </Link>
    </Card>
  );
}
