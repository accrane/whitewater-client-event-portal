import assert from "node:assert/strict";
import test from "node:test";

import { buildClientVendorInsert } from "../../src/lib/client/vendor-submissions.ts";

test("buildClientVendorInsert normalizes client vendor submission fields", () => {
  const insert = buildClientVendorInsert({
    companyName: "  Blue Ridge Catering  ",
    contactName: "  Taylor Smith  ",
    email: "  TAYLOR@EXAMPLE.COM  ",
    eventId: "event-1",
    notes: "  Gluten-free menu pending.  ",
    phone: "  555-123-4567  ",
    vendorType: "  Catering  ",
  });

  assert.deepEqual(insert, {
    event_id: "event-1",
    vendor_type: "Catering",
    company_name: "Blue Ridge Catering",
    contact_name: "Taylor Smith",
    email: "taylor@example.com",
    phone: "555-123-4567",
    notes: "Gluten-free menu pending.",
    metadata: {
      source: "client_portal",
      status: "needs_review",
    },
  });
});

test("buildClientVendorInsert rejects submissions without a company or contact name", () => {
  assert.throws(
    () =>
      buildClientVendorInsert({
        companyName: "",
        contactName: " ",
        email: "vendor@example.com",
        eventId: "event-1",
        notes: "",
        phone: "",
        vendorType: "Florist",
      }),
    /company or contact name/i,
  );
});

test("buildClientVendorInsert rejects missing event IDs", () => {
  assert.throws(
    () =>
      buildClientVendorInsert({
        companyName: "Vendor Co",
        contactName: "",
        email: "",
        eventId: " ",
        notes: "",
        phone: "",
        vendorType: "",
      }),
    /missing event ID/i,
  );
});
