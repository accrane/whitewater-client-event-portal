import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReviewedUploadMetadata,
  buildUploadReviewCountsByEvent,
  buildUploadReviewSummary,
  formatUploadFileSize,
  getUploadReviewClassName,
  isClientUploadNeedingReview,
} from "../../src/lib/admin/upload-review-presenters.ts";

test("buildUploadReviewSummary counts client uploads needing planner review", () => {
  const summary = buildUploadReviewSummary([
    { metadata: { source: "client_portal", status: "needs_review" }, status: "needs_review" },
    { metadata: { source: "client_portal", status: "needs_review" }, status: "needs_review" },
    { metadata: { source: "client_portal", status: "reviewed" }, status: "uploaded" },
  ]);

  assert.deepEqual(summary, {
    totalCount: 3,
    needsReviewCount: 2,
    label: "2 uploads need planner review",
    hasUploadsNeedingReview: true,
  });
});

test("buildUploadReviewSummary has a calm empty state when no uploads need review", () => {
  const summary = buildUploadReviewSummary([
    { metadata: { source: "client_portal", status: "reviewed" }, status: "uploaded" },
    { metadata: { source: "admin" }, status: "uploaded" },
  ]);

  assert.deepEqual(summary, {
    totalCount: 2,
    needsReviewCount: 0,
    label: "No uploads need planner review",
    hasUploadsNeedingReview: false,
  });
});

test("buildUploadReviewCountsByEvent groups client uploads needing review", () => {
  const counts = buildUploadReviewCountsByEvent([
    {
      event_id: "event-1",
      metadata: { source: "client_portal", status: "needs_review" },
      status: "needs_review",
    },
    {
      event_id: "event-1",
      metadata: { source: "client_portal", status: "reviewed" },
      status: "uploaded",
    },
    {
      event_id: "event-2",
      metadata: { source: "client_portal", status: "needs_review" },
      status: "needs_review",
    },
    {
      event_id: "event-2",
      metadata: { source: "client_portal", status: "needs_review" },
      status: "uploaded",
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

test("upload review helpers identify and highlight client uploads needing review", () => {
  const upload = {
    metadata: { source: "client_portal", status: "needs_review" },
    status: "needs_review",
  };

  assert.equal(isClientUploadNeedingReview(upload), true);
  assert.match(getUploadReviewClassName(upload), /border-amber-300/);
});

test("buildReviewedUploadMetadata preserves metadata and records planner review audit fields", () => {
  const metadata = buildReviewedUploadMetadata({
    reviewedAt: "2026-07-05T18:30:00.000Z",
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
    reviewedAt: "2026-07-05T18:30:00.000Z",
    reviewedBy: "planner@example.com",
  });
});

test("buildReviewedUploadMetadata rejects blank reviewer identities", () => {
  assert.throws(
    () =>
      buildReviewedUploadMetadata({
        existingMetadata: null,
        reviewedAt: "2026-07-05T18:30:00.000Z",
        reviewedBy: "  ",
      }),
    /reviewed by/i,
  );
});

test("formatUploadFileSize formats bytes for admin display", () => {
  assert.equal(formatUploadFileSize(637268), "622.3 KB");
  assert.equal(formatUploadFileSize(26214400), "25 MB");
});
