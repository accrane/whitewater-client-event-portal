import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  parseGhlInquiryPayload,
  buildInquiryEventSnapshot,
} from "../../src/lib/ghl/types.ts";
import {
  buildEventFieldWriteBackBody,
  buildPlanningStageBody,
} from "../../src/lib/ghl/opportunity-payloads.ts";

const validPayload = JSON.parse(
  readFileSync(
    new URL("../../src/lib/ghl/fixtures/inquiry.valid.json", import.meta.url),
    "utf8",
  ),
);

test("parseGhlInquiryPayload accepts the fixture payload", () => {
  const result = parseGhlInquiryPayload(validPayload);

  assert.equal(result.ok, true);
  assert.equal(result.payload.ghl_opportunity_id, "opp_test_789");
  assert.equal(result.payload.contact.name, "Jordan Client");
});

test("parseGhlInquiryPayload requires only location and opportunity ids", () => {
  const result = parseGhlInquiryPayload({
    ghl_location_id: "loc_1",
    ghl_opportunity_id: "opp_1",
  });

  assert.equal(result.ok, true);
});

test("parseGhlInquiryPayload rejects a missing opportunity id", () => {
  const result = parseGhlInquiryPayload({ ghl_location_id: "loc_1" });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ghl_opportunity_id is required"));
});

test("parseGhlInquiryPayload rejects malformed event dates", () => {
  const result = parseGhlInquiryPayload({
    ...validPayload,
    event: { ...validPayload.event, date: "08/15/2026" },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("event.date must use YYYY-MM-DD format"));
});

test("buildInquiryEventSnapshot uses the event name when present", () => {
  const parsed = parseGhlInquiryPayload(validPayload);
  const snapshot = buildInquiryEventSnapshot(parsed.payload);

  assert.equal(snapshot.eventName, "Acme Corp — Corporate Event");
  assert.equal(snapshot.eventDate, "2026-08-15");
  assert.equal(snapshot.contact.email, "jordan@example.com");
});

test("buildInquiryEventSnapshot falls back to the contact name", () => {
  const snapshot = buildInquiryEventSnapshot({
    ghl_location_id: "loc_1",
    ghl_opportunity_id: "opp_1",
    contact: { name: "Jordan Client" },
  });

  assert.equal(snapshot.eventName, "Inquiry — Jordan Client");
});

test("buildEventFieldWriteBackBody targets the configured custom field", () => {
  assert.deepEqual(buildEventFieldWriteBackBody("field_abc", "event-uuid"), {
    customFields: [{ id: "field_abc", field_value: "event-uuid" }],
  });
});

test("buildPlanningStageBody sets the pipeline and stage", () => {
  assert.deepEqual(buildPlanningStageBody("pipe_1", "stage_planning"), {
    pipelineId: "pipe_1",
    pipelineStageId: "stage_planning",
  });
});
