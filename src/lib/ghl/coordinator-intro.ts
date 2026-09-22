// The rule for "did a coordinator just send the intro email?".
//
// GHL's "Group Sales Inquiry: Step 3 – Coordinator Follow-Up" chase used to
// hang off GHL's "User Replied" trigger, which only fires for a message a
// user types in GHL's own Conversations screen. The portal sends as the
// location through the Conversations API, so GHL never counted it as a
// user reply and the chase never started. The workflow now triggers on this
// tag instead, and the portal adds it after sending a message that had an
// EC Welcome snippet inserted. The workflow removes the tag as its first
// action, so a later intro email can add it again and re-enrol the contact.
//
// Import-free so the rule is testable directly.

export const COORDINATOR_INTRO_TAG = "coordinator-intro-sent";

// Snippet names that count as the intro: anything containing "EC Welcome"
// (the team's naming rule) or the longer "Event Coordinator Welcome" the
// existing snippets use. Case-insensitive, extra spaces ignored.
export function isCoordinatorIntroSnippet(name: string): boolean {
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    normalized.includes("ec welcome") ||
    normalized.includes("event coordinator welcome")
  );
}

export function hasCoordinatorIntroSnippet(names: readonly string[]): boolean {
  return names.some(isCoordinatorIntroSnippet);
}
