import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReviewedVendorMetadata,
  buildVendorReviewCountsByEvent,
  buildVendorReviewSummary,
  formatVendorReviewSourceLabel,
  getVendorReviewClassName,
  isClientSubmittedVendorNeedingReview,
} from "../../src/lib/admin/vendor-submission-presenters.ts";

test("buildVendorReviewSummary counts client-submitted vendors needing planner review", () => {
  const summary = buildVendorReviewSummary([
    { metadata: { source: "client_portal", status: "needs_review" } },
    { metadata: { source: "client_portal", status: "needs_review" } },
    { metadata: { source: "ghl_sync" } },
  ]);

  assert.deepEqual(summary, {
    totalCount: 3,
    needsReviewCount: 2,
    label: "2 vendor submissions need planner review",
    hasVendorsNeedingReview: true,
  });
});

test("buildVendorReviewSummary has a calm empty state when no vendors need review", () => {
  const summary = buildVendorReviewSummary([
    { metadata: { source: "ghl_sync" } },
    { metadata: { source: "client_portal", status: "reviewed" } },
  ]);

  assert.deepEqual(summary, {
    totalCount: 2,
    needsReviewCount: 0,
    label: "No vendor submissions need planner review",
    hasVendorsNeedingReview: false,
  });
});

test("buildVendorReviewCountsByEvent groups client-submitted vendors needing review", () => {
  const counts = buildVendorReviewCountsByEvent([
    {
      event_id: "event-1",
      metadata: { source: "client_portal", status: "needs_review" },
    },
    {
      event_id: "event-1",
      metadata: { source: "client_portal", status: "reviewed" },
    },
    {
      event_id: "event-2",
      metadata: { source: "client_portal", status: "needs_review" },
    },
    {
      event_id: "event-2",
      metadata: { source: "client_portal", status: "needs_review" },
    },
    {
      event_id: "event-3",
      metadata: { source: "ghl_sync", status: "needs_review" },
    },
  ]);

  assert.deepEqual(
    counts,
    new Map([
      ["event-1", 1],
      ["event-2", 2],
    ]),
  );
});

test("vendor review helpers identify and highlight client portal needs-review metadata", () => {
  const metadata = { source: "client_portal", status: "needs_review" };

  assert.equal(isClientSubmittedVendorNeedingReview({ metadata }), true);
  assert.match(getVendorReviewClassName(metadata), /border-amber-300/);
  assert.equal(formatVendorReviewSourceLabel(metadata), "Client portal submission");
});

test("vendor review helpers handle non-object metadata", () => {
  assert.equal(isClientSubmittedVendorNeedingReview({ metadata: null }), false);
  assert.match(getVendorReviewClassName(null), /border-slate-200/);
  assert.equal(formatVendorReviewSourceLabel(null), "Planner/admin record");
});

test("buildReviewedVendorMetadata preserves metadata and records planner review audit fields", () => {
  const metadata = buildReviewedVendorMetadata({
    reviewedAt: "2026-07-02T18:30:00.000Z",
    reviewedBy: " planner@example.com ",
    existingMetadata: {
      source: "client_portal",
      status: "needs_review",
      originalField: "keep me",
    },
  });

  assert.deepEqual(metadata, {
    source: "client_portal",
    status: "reviewed",
    originalField: "keep me",
    reviewedAt: "2026-07-02T18:30:00.000Z",
    reviewedBy: "planner@example.com",
  });
});

test("buildReviewedVendorMetadata rejects blank reviewer identities", () => {
  assert.throws(
    () =>
      buildReviewedVendorMetadata({
        existingMetadata: null,
        reviewedAt: "2026-07-02T18:30:00.000Z",
        reviewedBy: "  ",
      }),
    /reviewed by/i,
  );
});
