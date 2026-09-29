// Which of an event's contracts go into GHL's two proposal fields. Proposal
// and contract are the same document here: the first one sent is the
// proposal (Proposal Link), and a later one — an order change restating the
// balance with the new items — is the revised proposal (Revised Proposal
// Link). The fields carry the client's Customer View link so GHL workflow
// emails can send it.
//
// Import-free so the rules are testable directly.

export type ProposalLinkContract = {
  status: string;
  createdAt: string;
  // PandaDoc's Customer View link; only issued once the document is sent.
  sharedLink: string | null;
};

export type ProposalLinks = {
  proposal: string | null;
  revisedProposal: string | null;
};

// A voided or declined contract never counts, so a re-issued first proposal
// takes the first slot. With three or more, the newest after the first is
// the revised one.
const RETIRED_STATUSES = new Set(["voided", "declined"]);

export function proposalLinksFor(
  contracts: readonly ProposalLinkContract[],
): ProposalLinks {
  const live = contracts
    .filter((contract) => contract.sharedLink && !RETIRED_STATUSES.has(contract.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    proposal: live[0]?.sharedLink ?? null,
    revisedProposal: live.length > 1 ? live[live.length - 1].sharedLink : null,
  };
}
