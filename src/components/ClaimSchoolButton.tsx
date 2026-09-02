"use client";

import { useState } from "react";
import { t } from "@/lib/i18n/dictionary";

export function ClaimSchoolButton({ schoolSlug }: { schoolSlug: string }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (done) {
    return <p className="hint-text">{t.school.claimSubmitted}</p>;
  }

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(true)}>
        {t.school.claimSchool}
      </button>
    );
  }

  async function submit() {
    setLoading(true);
    await fetch(`/api/schools/${schoolSlug}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofNote: note }),
    });
    setLoading(false);
    setDone(true);
  }

  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <p className="hint-text">{t.school.claimHint}</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn-sm" type="button" disabled={loading} onClick={submit}>
        {t.common.submit}
      </button>
    </div>
  );
}
