// Which GHL user each contact should be assigned to, derived from the
// opportunities in the sales pipeline. The portal treats the opportunity's
// assigned user as the event's coordinator, and GHL's contact-level
// "Assigned To" (what the Contacts list and contact-owner workflow steps
// read) has to match it: a coordinator assigned in the portal writes both
// (see assignOpportunityCoordinator), and the one-time backfill script uses
// this planner to catch up every contact that already has a coordinator.
//
// Import-free so the tests can load it directly.

export type AssignableOpportunity = {
  id: string;
  contactId: string | null;
  assignedTo: string | null;
  status: string | null;
  createdAt: string | null;
};

export type ContactAssignmentPlan = {
  contactId: string;
  ghlUserId: string;
  // The opportunity whose assignee won, for the audit trail.
  opportunityId: string;
};

// Open deals outrank closed ones; among equals the newest opportunity wins,
// so a repeat client is assigned to whoever is working their current event.
function rank(opportunity: AssignableOpportunity): number {
  return opportunity.status?.toLowerCase() === "open" ? 1 : 0;
}

function newerFirst(a: AssignableOpportunity, b: AssignableOpportunity): number {
  const byRank = rank(b) - rank(a);
  if (byRank !== 0) return byRank;
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

// One assignment per contact, from the opportunities that actually carry an
// assignee. Contacts whose opportunities are all unassigned are left out —
// the backfill never clears an existing contact owner.
export function planContactAssignments(
  opportunities: AssignableOpportunity[],
): ContactAssignmentPlan[] {
  const winners = new Map<string, AssignableOpportunity>();

  for (const opportunity of [...opportunities].sort(newerFirst)) {
    const contactId = opportunity.contactId?.trim();
    const ghlUserId = opportunity.assignedTo?.trim();
    if (!contactId || !ghlUserId) continue;
    if (!winners.has(contactId)) winners.set(contactId, opportunity);
  }

  return [...winners.entries()].map(([contactId, opportunity]) => ({
    contactId,
    ghlUserId: opportunity.assignedTo!.trim(),
    opportunityId: opportunity.id,
  }));
}
