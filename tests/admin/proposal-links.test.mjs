import assert from "node:assert/strict";
import test from "node:test";

import { proposalLinksFor } from "../../src/lib/contracts/proposal-links.ts";

const contract = (createdAt, sharedLink, status = "sent") => ({ createdAt, sharedLink, status });

test("no sent contracts leaves both fields empty", () => {
  assert.deepEqual(proposalLinksFor([]), { proposal: null, revisedProposal: null });
  assert.deepEqual(proposalLinksFor([contract("2026-09-01", null, "draft")]), {
    proposal: null,
    revisedProposal: null,
  });
});

test("the first sent contract is the proposal, signed or not", () => {
  assert.deepEqual(proposalLinksFor([contract("2026-09-01", "A", "completed")]), {
    proposal: "A",
    revisedProposal: null,
  });
});

test("a later contract is the revised proposal, and the newest wins", () => {
  assert.deepEqual(
    proposalLinksFor([
      contract("2026-09-20", "C"),
      contract("2026-09-01", "A", "completed"),
      contract("2026-09-10", "B", "completed"),
    ]),
    { proposal: "A", revisedProposal: "C" },
  );
});

test("voided and declined contracts don't count, so a re-issue takes their place", () => {
  assert.deepEqual(
    proposalLinksFor([
      contract("2026-09-01", "A", "voided"),
      contract("2026-09-02", "B"),
      contract("2026-09-03", "C", "declined"),
    ]),
    { proposal: "B", revisedProposal: null },
  );
});

test("a revised proposal not sent yet leaves its field empty", () => {
  assert.deepEqual(
    proposalLinksFor([contract("2026-09-01", "A"), contract("2026-09-10", null, "approval")]),
    { proposal: "A", revisedProposal: null },
  );
});
