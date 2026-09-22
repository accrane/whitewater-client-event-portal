// The rules for "did a coordinator just send the proposal?".
//
// GHL's Step 4 proposal chase triggers when the opportunity enters the
// Proposal Sent stage. The stage has to move when the coordinator actually
// sends the proposal link to the client, not when the document is approved
// in PandaDoc: approval only produces the link, and a proposal the client
// never received must not start their 24-hour chase. So the portal moves the
// stage after a successful conversations send that had a proposal snippet
// inserted, the same way an EC Welcome snippet tags the contact
// (coordinator-intro.ts).
//
// Import-free so the rules are testable directly.

// The stage's name in GHL. Resolved to an id from the configured pipeline at
// send time, so renaming the stage in GHL needs a matching update here.
export const PROPOSAL_SENT_STAGE_NAME = "Proposal Sent";

// Snippet names that count as the proposal: anything containing "proposal"
// (e.g. "Proposal Email", "Proposal Text"). Case-insensitive.
export function isProposalSnippet(name: string): boolean {
  return name.toLowerCase().includes("proposal");
}

export function hasProposalSnippet(names: readonly string[]): boolean {
  return names.some(isProposalSnippet);
}

export function isProposalSentStage(stageName: string): boolean {
  return (
    stageName.replace(/\s+/g, " ").trim().toLowerCase() ===
    PROPOSAL_SENT_STAGE_NAME.toLowerCase()
  );
}

// Only moves the opportunity forward. A proposal re-sent to a Booked client,
// or one already in Proposal Sent, leaves the stage alone; so does a Lost
// opportunity, which sits after Proposal Sent on the board. An unknown
// current stage (another pipeline, a removed stage) is also left alone.
export function shouldMoveToProposalSent(
  currentPosition: number | null,
  proposalSentPosition: number,
): boolean {
  return currentPosition !== null && currentPosition < proposalSentPosition;
}
