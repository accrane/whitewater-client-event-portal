// The rules for moving an opportunity to another stage from the pipeline
// board's "Move to…" menu. Any stage is allowed; the menu only warns about
// what a move into it sets off (or skips) elsewhere, and a move to Lost asks
// for an optional reason that lands as a note on the GHL contact.
//
// Import-free so the rules are testable directly.

function stageKey(stageName: string): string {
  return stageName.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isLostStage(stageName: string): boolean {
  return stageKey(stageName) === "lost";
}

// What happens (or doesn't) when an opportunity enters the stage, in the
// words the menu shows before the move. Booked is matched by id as well as
// name, like the board's badges. Null when the move sets nothing off.
export function stageMoveNotice(
  stage: { id: string; name: string },
  bookedStageId: string | null,
): string | null {
  const key = stageKey(stage.name);
  if (key === "proposal sent") {
    return "GHL starts its proposal follow-up chase as soon as it enters Proposal Sent — only move it here once the client has the proposal.";
  }
  if (stage.id === bookedStageId || key === "booked") {
    return "This only changes the stage. Rooms are booked on the contract's first payment, not by this move.";
  }
  if (key === "lost") {
    return "GHL lifts any follow-up pause. The reason is added as a note on the GHL contact.";
  }
  return null;
}

// The note written to the GHL contact on a move to Lost — with or without a
// reason, so anyone reading the contact in GHL sees who closed it out.
export function lostNoteBody({
  fromStage,
  reason,
  byEmail,
}: {
  fromStage: string | null;
  reason: string | null;
  byEmail: string | null;
}): string {
  const from = fromStage ? ` from ${fromStage}` : "";
  const by = ` (by ${byEmail ?? "the portal"})`;
  return reason
    ? `Moved to Lost${from}: ${reason}${by}.`
    : `Moved to Lost${from}${by}. No reason given.`;
}
