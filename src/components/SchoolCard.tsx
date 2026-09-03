import Link from "next/link";
import type { City, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { VerificationBadge } from "./VerificationBadge";
import { PinIcon } from "./Icon";

type SchoolWithCity = School & { city: City };

export function SchoolCard({ school }: { school: SchoolWithCity }) {
  return (
    <article className="card card--interactive event-card">
      <div className="event-card-thumb event-card-thumb--school" aria-hidden="true">
        <span>{school.name.charAt(0).toUpperCase()}</span>
      </div>

      <div className="event-card-body">
        <VerificationBadge status={school.verificationStatus} />
        <h3 style={{ margin: "8px 0 4px" }}>
          <Link href={`/schools/${school.slug}`}>{school.name}</Link>
        </h3>

        <div className="meta-row">
          <PinIcon />
          <span>{school.city.nameRu}</span>
        </div>

        {school.directions.length > 0 && (
          <p style={{ margin: "8px 0 0" }}>
            {school.directions.map((d) => (
              <span key={d} className="tag">
                {d}
              </span>
            ))}
          </p>
        )}

        <Link href={`/schools/${school.slug}`} className="btn btn-sm btn-outline event-card-cta">
          {t.common.details} »
        </Link>
      </div>
    </article>
  );
}
