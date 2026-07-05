import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChecklistReviewCountsByEvent,
  buildChecklistReviewSummary,
  getChecklistReviewClassName,
} from "../../src/lib/admin/checklist-review-presenters.ts";

test("buildChecklistReviewSummary counts client-submitted checklist items needing planner review", () => {
  const summary = buildChecklistReviewSummary([
    { status: "needs_review" },
    { status: "completed" },
    { status: "needs_review" },
    { status: "not_completed" },
  ]);

  assert.deepEqual(summary, {
    totalCount: 4,
    needsReviewCount: 2,
    label: "2 items need planner review",
    hasItemsNeedingReview: true,
  });
});

test("buildChecklistReviewSummary has a calm empty state when no items need review", () => {
  const summary = buildChecklistReviewSummary([
    { status: "completed" },
    { status: "not_applicable" },
  ]);

  assert.deepEqual(summary, {
    totalCount: 2,
    needsReviewCount: 0,
    label: "No checklist items need planner review",
    hasItemsNeedingReview: false,
  });
});

test("getChecklistReviewClassName highlights needs-review rows", () => {
  assert.match(getChecklistReviewClassName("needs_review"), /border-amber-300/);
  assert.match(getChecklistReviewClassName("not_completed"), /border-slate-200/);
});

test("buildChecklistReviewCountsByEvent groups needs-review items by event", () => {
  const counts = buildChecklistReviewCountsByEvent([
    { event_id: "event-1", status: "needs_review" },
    { event_id: "event-1", status: "completed" },
    { event_id: "event-2", status: "needs_review" },
    { event_id: "event-2", status: "needs_review" },
  ]);

  assert.deepEqual(counts, new Map([
    ["event-1", 1],
    ["event-2", 2],
  ]));
});
