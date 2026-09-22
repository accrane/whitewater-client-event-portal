import assert from "node:assert/strict";
import test from "node:test";

import {
  hasProposalSnippet,
  isProposalSentStage,
  isProposalSnippet,
  shouldMoveToProposalSent,
} from "../../src/lib/ghl/proposal-sent.ts";

test("snippet names containing proposal count, whatever the case", () => {
  assert.equal(isProposalSnippet("Proposal Email"), true);
  assert.equal(isProposalSnippet("Proposal Text"), true);
  assert.equal(isProposalSnippet("Revised PROPOSAL"), true);
  assert.equal(isProposalSnippet("Day Pass - EC Welcome Email"), false);
});

test("a message counts when any inserted snippet is a proposal", () => {
  assert.equal(hasProposalSnippet(["Directions", "Proposal Email"]), true);
  assert.equal(hasProposalSnippet(["Directions"]), false);
  assert.equal(hasProposalSnippet([]), false);
});

test("the Proposal Sent stage is found by name", () => {
  assert.equal(isProposalSentStage("Proposal Sent"), true);
  assert.equal(isProposalSentStage(" proposal  sent "), true);
  assert.equal(isProposalSentStage("Planning"), false);
});

test("the stage only moves forward", () => {
  // Board order: New Inquiry 0, Contacted 1, Planning 2, Proposal Sent 3,
  // Booked 4, Lost 5.
  assert.equal(shouldMoveToProposalSent(0, 3), true);
  assert.equal(shouldMoveToProposalSent(2, 3), true);
  assert.equal(shouldMoveToProposalSent(3, 3), false);
  assert.equal(shouldMoveToProposalSent(4, 3), false);
  assert.equal(shouldMoveToProposalSent(5, 3), false);
  assert.equal(shouldMoveToProposalSent(null, 3), false);
});
