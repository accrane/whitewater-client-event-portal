import assert from "node:assert/strict";
import test from "node:test";

import {
  contractStatusGroup,
  contractTab,
  matchesContractFilters,
  parseContractListFilters,
} from "../../src/lib/admin/event-filters.ts";

const samEvent = {
  name: "Acme Retreat",
  coordinatorName: "Sam Rivers",
  coordinatorEmail: "sam@whitewater.org",
  coordinatorGhlUserId: "ghl-sam",
  numberOfGuests: 80,
  eventDate: "2026-10-10",
  eventType: "General Inquiry",
};
const danaEvent = { ...samEvent, name: "Wedding Weekend", coordinatorName: "Dana Lee", coordinatorEmail: "dana@whitewater.org", coordinatorGhlUserId: "ghl-dana", eventDate: "2026-12-05" };

const awaitingApproval = { name: "Event Contract", status: "approval", pandadocStatus: "document.approval", recipientName: "Pat Client", event: samEvent };
const viewed = { name: "Final Payment", status: "viewed", pandadocStatus: "document.viewed", recipientName: "Pat Client", event: danaEvent };
const signedUnpaid = { name: "Event Contract", status: "completed", pandadocStatus: "document.waiting_pay", recipientName: "Pat Client", event: samEvent };
const signedPaid = { name: "Event Contract", status: "completed", pandadocStatus: "document.paid", recipientName: "Pat Client", event: danaEvent };

const base = { tab: "open", q: "", coordinator: null, status: null, from: null, to: null };

test("parseContractListFilters defaults to the open tab and drops a status from the other tab", () => {
  assert.deepEqual(parseContractListFilters({}), base);
  assert.equal(parseContractListFilters({ tab: "history", status: "signed" }).status, "signed");
  assert.equal(parseContractListFilters({ tab: "open", status: "signed" }).status, null);
  assert.equal(parseContractListFilters({ status: "needs_approval" }).status, "needs_approval");
  assert.equal(parseContractListFilters({ from: "2026-10-01", to: "nope" }).to, null);
});

test("statuses split into open and history tabs and map to groups", () => {
  assert.equal(contractTab("approval"), "open");
  assert.equal(contractTab("error"), "open");
  assert.equal(contractTab("completed"), "history");
  assert.equal(contractTab("declined"), "history");
  assert.equal(contractStatusGroup("approval", null), "needs_approval");
  assert.equal(contractStatusGroup("completed", "document.waiting_pay"), "unpaid");
  assert.equal(contractStatusGroup("completed", "document.completed"), "signed");
  assert.equal(contractStatusGroup("creating", null), "failed");
});

test("tab and status filters", () => {
  assert.equal(matchesContractFilters(awaitingApproval, base, null), true);
  assert.equal(matchesContractFilters(signedPaid, base, null), false);
  assert.equal(matchesContractFilters(awaitingApproval, { ...base, status: "needs_approval" }, null), true);
  assert.equal(matchesContractFilters(viewed, { ...base, status: "needs_approval" }, null), false);
  const history = { ...base, tab: "history" };
  assert.equal(matchesContractFilters(signedUnpaid, { ...history, status: "signed" }, null), true);
  assert.equal(matchesContractFilters(signedUnpaid, { ...history, status: "unpaid" }, null), true);
  assert.equal(matchesContractFilters(signedPaid, { ...history, status: "unpaid" }, null), false);
});

test("search covers contract, event, recipient and coordinator names", () => {
  assert.equal(matchesContractFilters(viewed, { ...base, q: "final" }, null), true);
  assert.equal(matchesContractFilters(viewed, { ...base, q: "wedding" }, null), true);
  assert.equal(matchesContractFilters(viewed, { ...base, q: "pat client" }, null), true);
  assert.equal(matchesContractFilters(viewed, { ...base, q: "dana" }, null), true);
  assert.equal(matchesContractFilters(viewed, { ...base, q: "acme" }, null), false);
});

test("coordinator and date filters use the event, including 'me'", () => {
  const me = { email: "sam@whitewater.org", ghlUserId: null, name: null };
  assert.equal(matchesContractFilters(awaitingApproval, { ...base, coordinator: "me" }, me), true);
  assert.equal(matchesContractFilters(viewed, { ...base, coordinator: "me" }, me), false);
  assert.equal(matchesContractFilters(viewed, { ...base, coordinator: "Dana Lee" }, null), true);
  assert.equal(matchesContractFilters(viewed, { ...base, from: "2026-12-01", to: "2026-12-31" }, null), true);
  assert.equal(matchesContractFilters(awaitingApproval, { ...base, from: "2026-12-01" }, null), false);
});
