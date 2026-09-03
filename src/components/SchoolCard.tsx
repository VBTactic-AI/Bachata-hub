import Link from "next/link";
import type { City, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { VerificationBadge } from "./VerificationBadge";
import { PinIcon } from "./Icon";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { buttonVariants } from "@/components/ui/button";

type SchoolWithCity = School & { city: City };

export function SchoolCard({ school }: { school: SchoolWithCity }) {
  return (
    <Card interactive className="flex flex-col overflow-hidden p-0">
      <div
        className="flex aspect-video items-center justify-center bg-gradient-school"
        aria-hidden="true"
      >
        <span className="font-display text-4xl font-extrabold text-primary-dark">
          {school.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-[18px] pt-3.5">
        <VerificationBadge status={school.verificationStatus} />
        <h3 className="mb-1 mt-2">
          <Link href={`/schools/${school.slug}`}>{school.name}</Link>
        </h3>

        <div className="mb-3 mt-1 flex items-center gap-1.5 text-[0.87rem] text-muted [&_svg]:shrink-0 [&_svg]:text-primary">
          <PinIcon />
          <span>{school.city.nameRu}</span>
        </div>

        {school.directions.length > 0 && (
          <p className="mb-3 mt-0">
            {school.directions.map((d) => (
              <Tag key={d}>{d}</Tag>
            ))}
          </p>
        )}

        <Link href={`/schools/${school.slug}`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-auto self-start no-underline" })}>
          {t.common.details} »
        </Link>
      </div>
    </Card>
  );
}
