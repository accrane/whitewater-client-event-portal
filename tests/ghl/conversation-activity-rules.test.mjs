import assert from "node:assert/strict";
import test from "node:test";

import {
  checkedActivity,
  nextActivity,
  parseConversationSummary,
  readMessageHistory,
  sameInstant,
} from "../../src/lib/ghl/conversation-activity-rules.ts";

const NOW = "2026-09-25T14:00:00.000Z";
const ms = (iso) => Date.parse(iso);

// Shapes below follow GHL's live responses (2026-09-24 test contacts).
function summary(overrides = {}) {
  return {
    conversationId: "conv1",
    contactId: "contact1",
    lastMessageAt: null,
    lastMessageDirection: null,
    lastMessageAutomated: false,
    lastManualAt: null,
    ...overrides,
  };
}

function stored(overrides = {}) {
  return {
    conversationId: "conv1",
    lastMessageAt: null,
    lastManualAt: null,
    lastHumanAt: null,
    lastHumanDirection: null,
    lastAutomatedAt: null,
    needsCheck: false,
    checkedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

test("a list entry is read from GHL's epoch-millisecond fields", () => {
  assert.deepEqual(
    parseConversationSummary({
      id: "c1",
      contactId: "k1",
      lastMessageDate: ms("2026-09-23T11:20:03.771Z"),
      lastMessageDirection: "inbound",
      lastOutboundMessageAction: "manual",
      lastManualMessageDate: ms("2026-09-23T11:20:03.771Z"),
    }),
    {
      conversationId: "c1",
      contactId: "k1",
      lastMessageAt: "2026-09-23T11:20:03.771Z",
      lastMessageDirection: "inbound",
      lastMessageAutomated: false,
      lastManualAt: "2026-09-23T11:20:03.771Z",
    },
  );
  // A placeholder conversation (no direction, nobody wrote).
  assert.equal(
    parseConversationSummary({ id: "c2", contactId: "k2", lastMessageDate: 1, lastMessageType: "TYPE_NO_SHOW" })
      .lastMessageDirection,
    null,
  );
  assert.equal(parseConversationSummary({ contactId: "k3" }), null);
  assert.equal(parseConversationSummary(null), null);
});

test("GHL's stamps for one message a moment apart still count as the same message", () => {
  assert.ok(sameInstant("2026-09-24T18:13:45.175Z", "2026-09-24T18:13:45.174Z"));
  assert.ok(sameInstant("2026-09-24T14:23:32.196Z", "2026-09-24T14:23:31.367Z"));
  assert.ok(!sameInstant("2026-09-24T14:23:32Z", "2026-09-24T14:28:39Z"));
  assert.ok(!sameInstant(null, "2026-09-24T14:23:32Z"));
});

test("a client's message as the newest one settles the row as theirs", () => {
  const next = nextActivity(
    summary({
      lastMessageAt: "2026-09-23T11:20:03.771Z",
      lastMessageDirection: "inbound",
      lastManualAt: "2026-09-23T11:20:03.771Z",
    }),
    null,
    NOW,
  );
  assert.equal(next.lastHumanDirection, "inbound");
  assert.equal(next.lastHumanAt, "2026-09-23T11:20:03.771Z");
  assert.equal(next.needsCheck, false);
  assert.equal(next.checkedAt, NOW);
});

test("a hand-written message from staff as the newest one settles the row as ours", () => {
  const next = nextActivity(
    summary({
      lastMessageAt: "2026-09-24T18:13:45.175Z",
      lastMessageDirection: "outbound",
      lastManualAt: "2026-09-24T18:13:45.174Z",
    }),
    stored({ lastHumanDirection: "inbound", lastHumanAt: "2026-09-20T10:00:00.000Z" }),
    NOW,
  );
  assert.equal(next.lastHumanDirection, "outbound");
  assert.equal(next.lastHumanAt, "2026-09-24T18:13:45.175Z");
  assert.equal(next.needsCheck, false);
});

test("an automated reminder after a new person's message needs the history (the reply-then-reminder case)", () => {
  // Rosie replied Sep 23 11:39; the proposal chase emailed her after that.
  const next = nextActivity(
    summary({
      lastMessageAt: "2026-09-24T13:37:35.435Z",
      lastMessageDirection: "outbound",
      lastMessageAutomated: true,
      lastManualAt: "2026-09-23T11:39:25.686Z",
    }),
    stored({
      lastManualAt: "2026-09-22T20:42:35.931Z",
      lastHumanAt: "2026-09-22T20:42:35.931Z",
      lastHumanDirection: "outbound",
    }),
    NOW,
  );
  assert.equal(next.needsCheck, true);
  assert.equal(next.lastManualAt, "2026-09-23T11:39:25.686Z");
  assert.equal(next.lastAutomatedAt, "2026-09-24T13:37:35.435Z");
  // Until then the row keeps what it knew.
  assert.equal(next.lastHumanDirection, "outbound");
});

test("only automated messages since the last look keep the settled row as it was", () => {
  const before = stored({
    lastManualAt: "2026-09-23T11:39:25.686Z",
    lastHumanAt: "2026-09-23T11:39:25.400Z",
    lastHumanDirection: "inbound",
  });
  const next = nextActivity(
    summary({
      lastMessageAt: "2026-09-25T09:00:00.000Z",
      lastMessageDirection: "outbound",
      lastMessageAutomated: true,
      lastManualAt: "2026-09-23T11:39:25.686Z",
    }),
    before,
    NOW,
  );
  assert.equal(next.needsCheck, false);
  assert.equal(next.lastHumanDirection, "inbound");
  assert.equal(next.lastHumanAt, "2026-09-23T11:39:25.400Z");
  assert.equal(next.checkedAt, before.checkedAt);
  assert.equal(next.lastAutomatedAt, "2026-09-25T09:00:00.000Z");
});

test("a conversation nobody has written in by hand settles as nobody", () => {
  const next = nextActivity(
    summary({
      lastMessageAt: "2026-09-22T20:25:59.979Z",
      lastMessageDirection: "outbound",
      lastMessageAutomated: true,
      lastManualAt: null,
    }),
    null,
    NOW,
  );
  assert.equal(next.lastHumanAt, null);
  assert.equal(next.lastHumanDirection, null);
  assert.equal(next.needsCheck, false);
});

test("an inbound message GHL didn't count as a person's is a workflow's, not the client's", () => {
  // The inquiry form's own email lands as "inbound" from a workflow.
  const next = nextActivity(
    summary({
      lastMessageAt: "2026-09-22T20:29:59.399Z",
      lastMessageDirection: "inbound",
      lastManualAt: null,
    }),
    null,
    NOW,
  );
  assert.equal(next.lastHumanDirection, null);
  assert.equal(next.needsCheck, false);
});

test("the history's newest person-written row decides, skipping workflow and activity rows", () => {
  // Rosie's conversation, newest first as GHL returns it.
  const rosie = readMessageHistory([
    { dateAdded: "2026-09-24T13:37:34.742Z", direction: "outbound", messageType: "TYPE_EMAIL", source: "workflow" },
    { dateAdded: "2026-09-23T20:42:41.559Z", direction: "outbound", messageType: "TYPE_EMAIL", source: "workflow" },
    { dateAdded: "2026-09-23T11:39:25.400Z", direction: "inbound", messageType: "TYPE_EMAIL" },
    { dateAdded: "2026-09-22T20:42:38.085Z", direction: "outbound", messageType: "TYPE_ACTIVITY_OPPORTUNITY", source: "app" },
    { dateAdded: "2026-09-22T20:42:35.931Z", direction: "outbound", messageType: "TYPE_EMAIL", source: "app" },
  ]);
  assert.deepEqual(rosie, {
    human: { at: "2026-09-23T11:39:25.400Z", direction: "inbound" },
    lastAutomatedAt: "2026-09-24T13:37:34.742Z",
  });

  // A portal send (source "app") is staff writing; order doesn't matter.
  const nora = readMessageHistory([
    { dateAdded: "2026-09-24T14:23:31.367Z", direction: "outbound", messageType: "TYPE_EMAIL", source: "app" },
    { dateAdded: "2026-09-24T14:38:06.459Z", direction: "outbound", messageType: "TYPE_ACTIVITY_OPPORTUNITY", source: "app" },
    { dateAdded: "2026-09-24T14:28:38.377Z", direction: "outbound", messageType: "TYPE_EMAIL", source: "workflow" },
    { dateAdded: "2026-09-24T14:09:54.654Z", direction: "inbound", messageType: "TYPE_EMAIL" },
  ]);
  assert.deepEqual(nora.human, { at: "2026-09-24T14:23:31.367Z", direction: "outbound" });
  assert.equal(nora.lastAutomatedAt, "2026-09-24T14:28:38.377Z");

  // The inquiry form's "inbound" workflow email is not the client.
  const formOnly = readMessageHistory([
    { dateAdded: "2026-09-22T20:29:59.399Z", direction: "inbound", messageType: "TYPE_EMAIL", source: "workflow" },
    { dateAdded: "2026-09-22T20:29:13.837Z", direction: "outbound", messageType: "TYPE_ACTIVITY_OPPORTUNITY", source: "app" },
  ]);
  assert.equal(formOnly.human, null);

  assert.deepEqual(readMessageHistory([]), { human: null, lastAutomatedAt: null });
});

test("a history look-up settles the person fields and keeps the list's", () => {
  const before = stored({
    lastMessageAt: "2026-09-24T13:37:35.435Z",
    lastManualAt: "2026-09-23T11:39:25.686Z",
    lastHumanAt: "2026-09-22T20:42:35.931Z",
    lastHumanDirection: "outbound",
    lastAutomatedAt: "2026-09-24T13:37:35.435Z",
    needsCheck: true,
  });
  const after = checkedActivity(
    before,
    "conv1",
    {
      human: { at: "2026-09-23T11:39:25.400Z", direction: "inbound" },
      lastAutomatedAt: "2026-09-24T13:37:34.742Z",
    },
    NOW,
  );
  assert.equal(after.lastHumanDirection, "inbound");
  assert.equal(after.lastHumanAt, "2026-09-23T11:39:25.400Z");
  assert.equal(after.lastMessageAt, before.lastMessageAt);
  assert.equal(after.lastManualAt, before.lastManualAt);
  // The newer of the two automated times.
  assert.equal(after.lastAutomatedAt, "2026-09-24T13:37:35.435Z");
  assert.equal(after.needsCheck, false);
  assert.equal(after.checkedAt, NOW);
});
