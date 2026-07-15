import assert from "node:assert/strict";
import test from "node:test";

import {
  ghlDateValueToIso,
  findDateOfInterest,
} from "../../src/lib/ghl/field-values.ts";

test("ghlDateValueToIso converts GHL epoch-ms date values", () => {
  // 2026-09-09T00:00:00Z, as returned for the Date of Interest field.
  assert.equal(ghlDateValueToIso(1788912000000), "2026-09-09");
});

test("ghlDateValueToIso accepts ISO strings and rejects junk", () => {
  assert.equal(ghlDateValueToIso("2026-09-09"), "2026-09-09");
  assert.equal(ghlDateValueToIso("2026-09-09T00:00:00.000Z"), "2026-09-09");
  assert.equal(ghlDateValueToIso("next tuesday"), null);
  assert.equal(ghlDateValueToIso(undefined), null);
  assert.equal(ghlDateValueToIso(Number.NaN), null);
});

test("findDateOfInterest pulls the configured field from customFields", () => {
  const customFields = [
    { id: "other", fieldValueString: "Yes" },
    { id: "date_field", fieldValueDate: 1788912000000, type: "date" },
  ];

  assert.equal(findDateOfInterest(customFields, "date_field"), "2026-09-09");
  assert.equal(findDateOfInterest(customFields, "missing"), null);
  assert.equal(findDateOfInterest(null, "date_field"), null);
});
