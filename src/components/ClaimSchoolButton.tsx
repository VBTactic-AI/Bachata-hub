"use client";

import { useState } from "react";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

export function ClaimSchoolButton({ schoolSlug }: { schoolSlug: string }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (done) {
    return <p className="text-sm text-night-muted">{t.school.claimSubmitted}</p>;
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
        className="border-night-border bg-transparent text-night-text hover:bg-night-card2"
      >
        {t.school.claimSchool}
      </Button>
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
    <Card className="flex max-w-[420px] flex-col gap-3.5 border-night-border bg-night-card">
      <p className="text-sm text-night-muted">{t.school.claimHint}</p>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="border-night-border bg-night-card2 text-night-text focus:border-night-primary focus:ring-night-primary/20"
      />
      <Button size="sm" type="button" disabled={loading} onClick={submit} className="self-start border-none bg-gradient-night-cta">
        {t.common.submit}
      </Button>
    </Card>
  );
}
