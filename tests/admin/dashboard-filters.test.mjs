import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCoordinatorNames,
  isCurrentCoordinatorsEvent,
  matchesDashboardEvent,
  parseDashboardFilters,
  EMPTY_FILTERS,
} from "../../src/lib/admin/event-filters.ts";

const sam = {
  coordinatorName: "Sam Rivers",
  coordinatorEmail: "sam@whitewater.org",
  coordinatorGhlUserId: "ghl-sam",
  numberOfGuests: 80,
  eventDate: "2026-10-10",
  eventType: "General Inquiry",
};

const unassigned = {
  coordinatorName: null,
  coordinatorEmail: null,
  coordinatorGhlUserId: null,
  numberOfGuests: null,
  eventDate: "2026-11-02",
  eventType: "Wedding Inquiry",
};

test("parseDashboardFilters adds the contracts switch to the shared filters", () => {
  assert.deepEqual(parseDashboardFilters({ contracts: "all", coordinator: "me" }), {
    ...EMPTY_FILTERS,
    coordinator: "me",
    contracts: "all",
  });
  assert.equal(parseDashboardFilters({ contracts: "everything" }).contracts, "window");
  assert.equal(parseDashboardFilters({}).contracts, "window");
});

test("the signed-in coordinator matches by email, GHL user id, or name", () => {
  assert.equal(
    isCurrentCoordinatorsEvent(sam, { email: "SAM@whitewater.org", ghlUserId: null, name: null }),
    true,
  );
  assert.equal(
    isCurrentCoordinatorsEvent(sam, { email: "other@whitewater.org", ghlUserId: "ghl-sam", name: null }),
    true,
  );
  assert.equal(
    isCurrentCoordinatorsEvent(
      { ...sam, coordinatorEmail: null, coordinatorGhlUserId: null },
      { email: "other@whitewater.org", ghlUserId: "ghl-other", name: "sam rivers" },
    ),
    true,
  );
  assert.equal(
    isCurrentCoordinatorsEvent(sam, { email: "other@whitewater.org", ghlUserId: "ghl-other", name: "Other" }),
    false,
  );
  assert.equal(isCurrentCoordinatorsEvent(unassigned, { email: null, ghlUserId: null, name: null }), false);
});

test("coordinator filter accepts me, unassigned, or a name", () => {
  const me = { email: "sam@whitewater.org", ghlUserId: null, name: null };
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, coordinator: "me" }, me), true);
  assert.equal(matchesDashboardEvent(unassigned, { ...EMPTY_FILTERS, coordinator: "me" }, me), false);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, coordinator: "me" }, null), false);
  assert.equal(matchesDashboardEvent(unassigned, { ...EMPTY_FILTERS, coordinator: "unassigned" }, me), true);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, coordinator: "unassigned" }, me), false);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, coordinator: "sam rivers" }, me), true);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, coordinator: "Dana" }, me), false);
});

test("guest, date, and type filters apply to events the same way as opportunities", () => {
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, minGuests: 50, maxGuests: 100 }, null), true);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, minGuests: 100 }, null), false);
  assert.equal(matchesDashboardEvent(unassigned, { ...EMPTY_FILTERS, maxGuests: 10 }, null), false);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-31" }, null), true);
  assert.equal(matchesDashboardEvent(unassigned, { ...EMPTY_FILTERS, to: "2026-10-31" }, null), false);
  assert.equal(matchesDashboardEvent(unassigned, { ...EMPTY_FILTERS, type: "wedding inquiry" }, null), true);
  assert.equal(matchesDashboardEvent(sam, { ...EMPTY_FILTERS, type: "Wedding Inquiry" }, null), false);
});

test("collectCoordinatorNames dedupes case-insensitively and sorts", () => {
  assert.deepEqual(
    collectCoordinatorNames([sam, unassigned, { coordinatorName: " sam rivers " }, { coordinatorName: "Dana Lee" }]),
    ["Dana Lee", "Sam Rivers"],
  );
});
