import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFiltersToParams,
  collectGroupTypes,
  countActiveFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  matchesOpportunityFilters,
  parseGuestCount,
  parseOpportunityFilters,
} from "../../src/lib/admin/event-filters.ts";

const corporate = {
  coordinatorId: "user-1",
  guestCount: 120,
  eventDate: "2026-10-15",
  inquiryType: "General Inquiry",
};

const wedding = {
  coordinatorId: null,
  guestCount: 40,
  eventDate: "2026-12-05",
  inquiryType: "Wedding Inquiry",
};

const blank = {
  coordinatorId: "user-2",
  guestCount: null,
  eventDate: null,
  inquiryType: null,
};

test("parseOpportunityFilters keeps valid values and drops malformed ones", () => {
  const filters = parseOpportunityFilters({
    coordinator: " user-1 ",
    min_guests: "100",
    max_guests: "lots",
    from: "2026-10-01",
    to: "not a date",
    type: "Wedding Inquiry",
  });

  assert.deepEqual(filters, {
    coordinator: "user-1",
    minGuests: 100,
    maxGuests: null,
    from: "2026-10-01",
    to: null,
    type: "Wedding Inquiry",
  });
  assert.equal(parseGuestCount("0"), 0);
  assert.equal(parseGuestCount(" 42 "), 42);
  assert.equal(parseGuestCount("-5"), null);
  assert.equal(parseGuestCount("1.5"), null);
  assert.equal(parseGuestCount(""), null);
  assert.deepEqual(parseOpportunityFilters({}), EMPTY_FILTERS);
});

test("hasActiveFilters and countActiveFilters treat a date range as one filter", () => {
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  const filters = { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-31", type: "Wedding Inquiry" };
  assert.equal(hasActiveFilters(filters), true);
  assert.equal(countActiveFilters(filters), 2);
});

test("coordinator filter matches the assigned user or the unassigned cards", () => {
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, coordinator: "user-1" }), true);
  assert.equal(matchesOpportunityFilters(wedding, { ...EMPTY_FILTERS, coordinator: "user-1" }), false);
  assert.equal(matchesOpportunityFilters(wedding, { ...EMPTY_FILTERS, coordinator: "unassigned" }), true);
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, coordinator: "unassigned" }), false);
});

test("group size bounds are inclusive, work alone or together, and skip cards with no count", () => {
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, minGuests: 100, maxGuests: 199 }), true);
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, minGuests: 120, maxGuests: 120 }), true);
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, minGuests: 200 }), false);
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, maxGuests: 119 }), false);
  assert.equal(matchesOpportunityFilters(wedding, { ...EMPTY_FILTERS, maxGuests: 50 }), true);
  assert.equal(matchesOpportunityFilters(blank, { ...EMPTY_FILTERS, minGuests: 0 }), false);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, minGuests: 10, maxGuests: 20 }), 1);
});

test("date range compares the event date inclusively and excludes undated cards", () => {
  const october = { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-31" };
  assert.equal(matchesOpportunityFilters(corporate, october), true);
  assert.equal(matchesOpportunityFilters(wedding, october), false);
  assert.equal(matchesOpportunityFilters(blank, october), false);
  assert.equal(matchesOpportunityFilters(wedding, { ...EMPTY_FILTERS, from: "2026-12-05" }), true);
  assert.equal(matchesOpportunityFilters(wedding, { ...EMPTY_FILTERS, to: "2026-12-04" }), false);
});

test("group type matches case-insensitively and filters combine", () => {
  assert.equal(matchesOpportunityFilters(wedding, { ...EMPTY_FILTERS, type: "wedding inquiry" }), true);
  assert.equal(matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, type: "Wedding Inquiry" }), false);
  assert.equal(matchesOpportunityFilters(blank, { ...EMPTY_FILTERS, type: "General Inquiry" }), false);
  assert.equal(
    matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, coordinator: "user-1", minGuests: 100, type: "General Inquiry" }),
    true,
  );
  assert.equal(
    matchesOpportunityFilters(corporate, { ...EMPTY_FILTERS, coordinator: "user-1", maxGuests: 24 }),
    false,
  );
});

test("applyFiltersToParams writes only the set filters", () => {
  const params = new URLSearchParams();
  applyFiltersToParams(params, { ...EMPTY_FILTERS, coordinator: "user-1", minGuests: 50, to: "2026-10-31" });
  assert.equal(params.toString(), "coordinator=user-1&min_guests=50&to=2026-10-31");
});

test("collectGroupTypes dedupes case-insensitively and sorts", () => {
  assert.deepEqual(
    collectGroupTypes([wedding, corporate, blank, { inquiryType: " wedding inquiry " }, { inquiryType: "Adventure Lodging Inquiry" }]),
    ["Adventure Lodging Inquiry", "General Inquiry", "Wedding Inquiry"],
  );
});
