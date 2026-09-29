import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpportunityBadges,
  chaseFromTags,
} from "../../src/lib/admin/opportunity-badges.ts";

const NOW = Date.parse("2026-09-25T14:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(NOW - ms).toISOString();

function input(overrides = {}) {
  return {
    now: NOW,
    today: "2026-09-25",
    stageName: "Planning",
    phase: "sales",
    isFirstStage: false,
    createdAt: ago(10 * DAY),
    lastStageChangeAt: ago(1 * DAY),
    eventDate: null,
    eventEndDate: null,
    inquirySource: "form",
    expedited: false,
    paused: false,
    contactTags: [],
    conversation: null,
    ...overrides,
  };
}

const keys = (badges) => badges.map((badge) => badge.key);
const only = (overrides, key) =>
  buildOpportunityBadges(input(overrides)).find((badge) => badge.key === key) ?? null;

test("chase tags follow Step 3's naming; the latest step wins", () => {
  assert.deepEqual(chaseFromTags(["groups", "group sales - step 3 waiting for response"]), {
    step: "3",
    label: "Coordinator chase",
    tag: "group sales - step 3 waiting for response",
  });
  assert.equal(
    chaseFromTags([
      "group sales - step 3 waiting for response",
      "group sales - step 4 waiting for response",
    ]).label,
    "Proposal chase",
  );
  assert.equal(chaseFromTags(["Group Sales - Step 1 Waiting for Response"]).label, "Inquiry chase");
  assert.equal(chaseFromTags(["group sales - step 4a waiting for response"]).label, "Step 4a chase");
  assert.equal(chaseFromTags(["coordinator-intro-sent", "follow-ups-paused", "inquiry-phone"]), null);
});

test("a client who wrote last is waiting; it turns red after a day", () => {
  const fresh = only(
    { conversation: { lastHumanAt: ago(3 * HOUR), lastHumanDirection: "inbound", lastAutomatedAt: null } },
    "client-waiting",
  );
  assert.equal(fresh.label, "Client waiting 3h");
  assert.equal(fresh.tone, "info");

  const stale = only(
    {
      conversation: {
        lastHumanAt: "2026-09-23T11:39:25.400Z",
        lastHumanDirection: "inbound",
        lastAutomatedAt: "2026-09-24T13:37:34.742Z",
      },
    },
    "client-waiting",
  );
  assert.equal(stale.label, "Client waiting 2d");
  assert.equal(stale.tone, "danger");
  // Venue time in the detail, whatever the server's zone.
  assert.match(stale.detail, /Sep 23, 7:39 AM/);

  // Booked clients' questions count too.
  assert.ok(
    only(
      { phase: "booked", stageName: "Booked", conversation: { lastHumanAt: ago(2 * DAY), lastHumanDirection: "inbound", lastAutomatedAt: null } },
      "client-waiting",
    ),
  );
});

test("a website inquiry nobody has written to is flagged after a day in New Inquiry", () => {
  const newInquiry = {
    stageName: "New Inquiry",
    isFirstStage: true,
    createdAt: ago(2 * DAY),
    lastStageChangeAt: ago(2 * DAY),
    conversation: { lastHumanAt: null, lastHumanDirection: null, lastAutomatedAt: ago(2 * DAY) },
  };
  assert.equal(only(newInquiry, "not-contacted").tone, "danger");
  assert.equal(only({ ...newInquiry, createdAt: ago(5 * HOUR) }, "not-contacted"), null);
  assert.equal(only({ ...newInquiry, inquirySource: "phone" }, "not-contacted"), null);
  assert.equal(only({ ...newInquiry, paused: true }, "not-contacted"), null);
  assert.equal(only({ ...newInquiry, isFirstStage: false, stageName: "Planning" }, "not-contacted"), null);
  // Unknown conversation: no conversation badge at all.
  assert.equal(only({ ...newInquiry, conversation: null }, "not-contacted"), null);
});

test("quiet counts days since staff last wrote by hand: amber at 5, red at 10", () => {
  const quiet = (days, extra = {}) =>
    only(
      {
        conversation: { lastHumanAt: ago(days * DAY + HOUR), lastHumanDirection: "outbound", lastAutomatedAt: null },
        ...extra,
      },
      "quiet",
    );
  assert.equal(quiet(4), null);
  assert.equal(quiet(6).label, "Quiet 6d");
  assert.equal(quiet(6).tone, "warning");
  assert.equal(quiet(12).tone, "danger");
  assert.equal(quiet(12, { phase: "booked", stageName: "Booked" }), null);
  assert.equal(quiet(12, { paused: true }), null);

  const chased = only(
    {
      conversation: {
        lastHumanAt: ago(8 * DAY),
        lastHumanDirection: "outbound",
        lastAutomatedAt: ago(1 * DAY),
      },
    },
    "quiet",
  );
  assert.match(chased.detail, /GHL has sent automatic follow-ups since/);
});

test("event timing: soon before it books, passed while still open", () => {
  const soon = (eventDate, extra = {}) => only({ eventDate, ...extra }, "event-soon");
  assert.equal(soon("2026-09-25").label, "Event today");
  assert.equal(soon("2026-09-26").label, "Event tomorrow");
  assert.equal(soon("2026-09-30").label, "Event in 5d");
  assert.equal(soon("2026-09-30").tone, "danger");
  assert.equal(soon("2026-10-09").tone, "warning");
  assert.equal(soon("2026-10-30"), null);
  assert.equal(soon("2026-09-30", { phase: "booked", stageName: "Booked" }), null);

  // A multi-day event that started yesterday and ends tomorrow.
  assert.equal(
    soon("2026-09-24", { eventEndDate: "2026-09-26" }).label,
    "Event under way",
  );

  const passed = only({ eventDate: "2026-09-18" }, "date-passed");
  assert.match(passed.detail, /Change the date, or move it to Lost/);
  const bookedPassed = only(
    { eventDate: "2026-09-18", phase: "booked", stageName: "Booked" },
    "date-passed",
  );
  assert.match(bookedPassed.detail, /Mark the opportunity Won/);
  assert.equal(only({ eventDate: "2026-09-18", phase: "lost", stageName: "Lost" }, "date-passed"), null);
  // Not passed while a multi-day event is still running.
  assert.equal(only({ eventDate: "2026-09-23", eventEndDate: "2026-09-25" }, "date-passed"), null);
});

test("expedited and phone inquiries keep their badges", () => {
  assert.equal(only({ expedited: true, inquirySource: "phone" }, "expedited").tone, "danger");
  assert.equal(only({ expedited: true, inquirySource: "phone" }, "phone"), null);
  assert.equal(only({ inquirySource: "phone" }, "phone").tone, "neutral");
});

test("a deal past its stage's usual time gets an amber badge", () => {
  assert.equal(
    only({ stageName: "New Inquiry", lastStageChangeAt: ago(3 * DAY + HOUR) }, "stage-age").label,
    "3d in stage",
  );
  assert.equal(only({ stageName: "New Inquiry", lastStageChangeAt: ago(2 * DAY + HOUR) }, "stage-age"), null);
  assert.equal(only({ stageName: "Proposal Sent", lastStageChangeAt: ago(10 * DAY) }, "stage-age"), null);
  assert.equal(
    only({ stageName: "Booked", phase: "booked", lastStageChangeAt: ago(60 * DAY) }, "stage-age"),
    null,
  );
  assert.equal(only({ stageName: "Other", lastStageChangeAt: ago(60 * DAY) }, "stage-age"), null);
});

test("the chase badge: running, paused, or left behind on a booked deal", () => {
  const tags = ["group sales - step 4 waiting for response"];
  assert.equal(only({ contactTags: tags }, "chase").tone, "info");
  assert.equal(only({ contactTags: tags, paused: true }, "chase").tone, "neutral");
  const leftover = only({ contactTags: tags, phase: "booked", stageName: "Booked" }, "chase");
  assert.equal(leftover.tone, "warning");
  assert.match(leftover.detail, /Booked\/Lost workflow/);
});

test("badges come in a fixed order: conversation, timing, intake, stage, chase", () => {
  const badges = buildOpportunityBadges(
    input({
      stageName: "Planning",
      eventDate: "2026-09-18",
      expedited: true,
      inquirySource: "phone",
      lastStageChangeAt: ago(13 * DAY),
      contactTags: ["group sales - step 3 waiting for response"],
      conversation: { lastHumanAt: ago(2 * DAY), lastHumanDirection: "inbound", lastAutomatedAt: null },
    }),
  );
  assert.deepEqual(keys(badges), ["client-waiting", "date-passed", "expedited", "stage-age", "chase"]);
  assert.deepEqual(keys(buildOpportunityBadges(input())), []);
});
