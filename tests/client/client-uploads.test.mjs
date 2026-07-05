import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientUploadInsert,
  buildClientUploadStoragePath,
  validateClientUploadFile,
} from "../../src/lib/client/uploads.ts";

test("validateClientUploadFile accepts MVP document and image types up to 25 MB", () => {
  assert.deepEqual(
    validateClientUploadFile({
      name: " floor plan.pdf ",
      size: 25 * 1024 * 1024,
      type: "application/pdf",
    }),
    {
      fileName: "floor plan.pdf",
      fileMimeType: "application/pdf",
      fileSizeBytes: 26214400,
    },
  );

  assert.equal(
    validateClientUploadFile({
      name: "photo.HEIC",
      size: 1024,
      type: "image/heic",
    }).fileMimeType,
    "image/heic",
  );
});

test("validateClientUploadFile rejects blank files, large files, and unsupported types", () => {
  assert.throws(
    () => validateClientUploadFile({ name: "", size: 100, type: "application/pdf" }),
    /file name/i,
  );
  assert.throws(
    () => validateClientUploadFile({ name: "empty.pdf", size: 0, type: "application/pdf" }),
    /empty/i,
  );
  assert.throws(
    () =>
      validateClientUploadFile({
        name: "too-large.pdf",
        size: 25 * 1024 * 1024 + 1,
        type: "application/pdf",
      }),
    /25 MB/i,
  );
  assert.throws(
    () => validateClientUploadFile({ name: "notes.txt", size: 100, type: "text/plain" }),
    /unsupported/i,
  );
});

test("buildClientUploadStoragePath creates an event-scoped sanitized path", () => {
  assert.equal(
    buildClientUploadStoragePath({
      eventId: " event-1 ",
      fileName: " Floor Plan Final.pdf ",
      uploadId: "upload-1",
    }),
    "events/event-1/client/upload-1-floor-plan-final.pdf",
  );
});

test("buildClientUploadInsert records private storage metadata for planner review", () => {
  const insert = buildClientUploadInsert({
    eventId: "event-1",
    fileName: "floor plan.pdf",
    fileMimeType: "application/pdf",
    fileSizeBytes: 2048,
    storageBucket: "event-uploads",
    storagePath: "events/event-1/client/upload-1-floor-plan.pdf",
  });

  assert.deepEqual(insert, {
    event_id: "event-1",
    file_name: "floor plan.pdf",
    file_mime_type: "application/pdf",
    file_size_bytes: 2048,
    storage_bucket: "event-uploads",
    storage_path: "events/event-1/client/upload-1-floor-plan.pdf",
    status: "needs_review",
    uploaded_by: "client",
    metadata: {
      source: "client_portal",
      status: "needs_review",
    },
  });
});
