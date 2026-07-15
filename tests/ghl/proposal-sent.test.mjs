import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { parseGhlProposalSentPayload } from "../../src/lib/ghl/types.ts";
import { resolveRoomFromGhlValue } from "../../src/lib/ghl/room-mapping.ts";

const validPayload = JSON.parse(
  readFileSync(
    new URL("../../src/lib/ghl/fixtures/proposal-sent.valid.json", import.meta.url),
    "utf8",
  ),
);

test("parseGhlProposalSentPayload accepts the fixture payload", () => {
  const result = parseGhlProposalSentPayload(validPayload);

  assert.equal(result.ok, true);
  assert.equal(result.payload.event.room, "Big Drop");
  assert.equal(result.payload.client_name, "Acme Corp");
});

test("parseGhlProposalSentPayload requires room, start, and end", () => {
  const result = parseGhlProposalSentPayload({
    ...validPayload,
    event: { name: "Missing everything else" },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("event.room is required"));
  assert.ok(result.errors.includes("event.start is required"));
  assert.ok(result.errors.includes("event.end is required"));
});

test("parseGhlProposalSentPayload rejects end before start", () => {
  const result = parseGhlProposalSentPayload({
    ...validPayload,
    event: {
      ...validPayload.event,
      start: "2026-08-15T16:00:00-04:00",
      end: "2026-08-15T10:00:00-04:00",
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("event.end must be after event.start"));
});

test("parseGhlProposalSentPayload rejects unparseable datetimes", () => {
  const result = parseGhlProposalSentPayload({
    ...validPayload,
    event: { ...validPayload.event, start: "next tuesday" },
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.includes("event.start must be a valid ISO 8601 datetime"),
  );
});

const rooms = [
  { id: "room-a", name: "Room A" },
  { id: "big-drop", name: "Big Drop" },
];

test("resolveRoomFromGhlValue matches room names case-insensitively", () => {
  assert.equal(resolveRoomFromGhlValue("  big drop ", rooms)?.id, "big-drop");
});

test("resolveRoomFromGhlValue returns null for unknown values", () => {
  assert.equal(resolveRoomFromGhlValue("Moon Base", rooms), null);
});
