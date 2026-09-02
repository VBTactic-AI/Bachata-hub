import Link from "next/link";
import type { City, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { VerificationBadge } from "./VerificationBadge";

type SchoolWithCity = School & { city: City };

export function SchoolCard({ school }: { school: SchoolWithCity }) {
  return (
    <article className="card card--interactive">
      <VerificationBadge status={school.verificationStatus} />
      <h3 style={{ margin: "8px 0 4px" }}>
        <Link href={`/schools/${school.slug}`}>{school.name}</Link>
      </h3>
      <p className="hint-text" style={{ margin: 0 }}>
        {school.city.nameRu}
      </p>
      {school.directions.length > 0 && (
        <p style={{ marginTop: 8 }}>
          {school.directions.map((d) => (
            <span key={d} className="tag">
              {d}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}
