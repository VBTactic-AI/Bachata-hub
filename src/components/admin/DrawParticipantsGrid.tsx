import { Badge } from "@/components/ui/badge";
import { RemoveDrawHelperButton } from "./RemoveDrawHelperButton";
import { ReplaceDrawHelperButton } from "./ReplaceDrawHelperButton";

type Participant = {
  id: string;
  role: "LEADER" | "FOLLOWER";
  scored: boolean;
  registration: { dancer: { displayName: string }; checkIn: { bibNumber: string | null } | null };
};

function Column({
  heatId,
  role,
  title,
  participants,
  canEditDraw,
}: {
  heatId: string;
  role: "LEADER" | "FOLLOWER";
  title: string;
  participants: Participant[];
  canEditDraw: boolean;
}) {
  return (
    <div>
      <p className="m-0 text-sm font-semibold">
        {title} <span className="text-muted font-normal">{participants.length}</span>
      </p>
      <div className="stack gap-1 mt-1">
        {participants.map((p) => (
          <p key={p.id} className="hint-text m-0 flex flex-wrap items-center gap-1.5">
            <span>
              {p.registration.dancer.displayName}
              {p.registration.checkIn?.bibNumber ? ` №${p.registration.checkIn.bibNumber}` : ""}
            </span>
            {!p.scored && <Badge variant="pending">помощник</Badge>}
            {!p.scored && canEditDraw && (
              <>
                <ReplaceDrawHelperButton heatId={heatId} participantId={p.id} role={role} />
                <RemoveDrawHelperButton participantId={p.id} />
              </>
            )}
          </p>
        ))}
      </div>
    </div>
  );
}

// Ведущие и ведомые — двумя колонками рядом (не единым списком вперемешку) —
// так сразу видно и число, и состав каждой стороны, удобно ловить дисбаланс.
export function DrawParticipantsGrid({
  heatId,
  participants,
  canEditDraw,
}: {
  heatId: string;
  participants: Participant[];
  canEditDraw: boolean;
}) {
  const leaders = participants.filter((p) => p.role === "LEADER");
  const followers = participants.filter((p) => p.role === "FOLLOWER");

  return (
    <div className="grid grid-cols-2 gap-4 mt-2 pl-3" style={{ maxWidth: 420 }}>
      <Column heatId={heatId} role="LEADER" title="Ведущий" participants={leaders} canEditDraw={canEditDraw} />
      <Column heatId={heatId} role="FOLLOWER" title="Ведомый" participants={followers} canEditDraw={canEditDraw} />
    </div>
  );
}
