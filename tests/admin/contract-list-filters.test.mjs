import assert from "node:assert/strict";
import test from "node:test";

import {
  contractStatusGroup,
  contractTab,
  matchesContractFilters,
  nextContractSort,
  parseContractListFilters,
  parseContractSort,
  sortContracts,
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

test("parseContractSort accepts known columns only and defaults to ascending", () => {
  assert.equal(parseContractSort({}), null);
  assert.equal(parseContractSort({ sort: "pandadoc" }), null);
  assert.deepEqual(parseContractSort({ sort: "status" }), { key: "status", dir: "asc" });
  assert.deepEqual(parseContractSort({ sort: "amount", dir: "desc" }), { key: "amount", dir: "desc" });
  assert.deepEqual(parseContractSort({ sort: "date", dir: "sideways" }), { key: "date", dir: "asc" });
});

test("a header click cycles first direction, reverse, then back to the page order", () => {
  assert.deepEqual(nextContractSort(null, "status"), { key: "status", dir: "asc" });
  assert.deepEqual(nextContractSort({ key: "status", dir: "asc" }, "status"), { key: "status", dir: "desc" });
  assert.equal(nextContractSort({ key: "status", dir: "desc" }, "status"), null);
  assert.deepEqual(nextContractSort({ key: "status", dir: "desc" }, "date"), { key: "date", dir: "asc" });
  assert.deepEqual(nextContractSort(null, "amount"), { key: "amount", dir: "desc" });
  assert.deepEqual(nextContractSort({ key: "amount", dir: "desc" }, "amount"), { key: "amount", dir: "asc" });
  assert.equal(nextContractSort({ key: "amount", dir: "asc" }, "amount"), null);
});

test("sorting by status keeps each status together and ties in their incoming order", () => {
  const row = (id, status, pandadocStatus = null, extra = {}) => ({
    id,
    name: "Event Contract",
    status,
    pandadocStatus,
    recipientName: null,
    amount: null,
    event: samEvent,
    ...extra,
  });
  const open = [
    row("sent-1", "sent"),
    row("approval-1", "approval"),
    row("error-1", "error"),
    row("viewed-1", "viewed"),
    row("approval-2", "approval"),
    row("draft-1", "draft"),
    row("sent-2", "sent"),
  ];
  const ids = (rows) => rows.map((contract) => contract.id);
  assert.deepEqual(ids(sortContracts(open, { key: "status", dir: "asc" })), [
    "approval-1", "approval-2", "error-1", "draft-1", "sent-1", "sent-2", "viewed-1",
  ]);
  assert.deepEqual(ids(sortContracts(open, { key: "status", dir: "desc" })), [
    "viewed-1", "sent-1", "sent-2", "error-1", "draft-1", "approval-1", "approval-2",
  ]);
  assert.equal(sortContracts(open, null), open);

  const history = [
    row("declined-1", "declined"),
    row("unpaid-1", "completed", "document.waiting_pay"),
    row("voided-1", "voided"),
    row("signed-1", "completed", "document.paid"),
    row("signed-2", "completed", "document.completed"),
  ];
  assert.deepEqual(ids(sortContracts(history, { key: "status", dir: "asc" })), [
    "signed-1", "signed-2", "unpaid-1", "declined-1", "voided-1",
  ]);
});

test("empty cells sort last in both directions; amounts and names compare properly", () => {
  const row = (id, extra) => ({
    id,
    name: "Event Contract",
    status: "sent",
    pandadocStatus: null,
    recipientName: null,
    amount: null,
    event: samEvent,
    ...extra,
  });
  const rows = [
    row("none", {}),
    row("small", { amount: 900, recipientName: "zoe Client", event: { ...samEvent, eventDate: "2026-12-05", coordinatorName: null } }),
    row("big", { amount: 12000, recipientName: "Adam Client", event: { ...samEvent, eventDate: null } }),
  ];
  const ids = (key, dir) => sortContracts(rows, { key, dir }).map((contract) => contract.id);
  assert.deepEqual(ids("amount", "desc"), ["big", "small", "none"]);
  assert.deepEqual(ids("amount", "asc"), ["small", "big", "none"]);
  assert.deepEqual(ids("customer", "asc"), ["big", "small", "none"]);
  assert.deepEqual(ids("customer", "desc"), ["small", "big", "none"]);
  assert.deepEqual(ids("date", "asc"), ["none", "small", "big"]);
  assert.deepEqual(ids("coordinator", "asc"), ["none", "big", "small"]);
});

