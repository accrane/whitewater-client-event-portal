import assert from "node:assert/strict";
import test from "node:test";

import { buildEventChecklistItemInserts } from "../../src/lib/admin/checklist-template-builders.ts";

test("buildEventChecklistItemInserts copies template fields and calculates due dates before the event", () => {
  const inserts = buildEventChecklistItemInserts({
    eventDate: "2026-08-15",
    eventId: "event-1",
    templateItems: [
      {
        id: "template-item-1",
        title: "Confirm arrival details",
        description: "Review arrival time and location.",
        item_type: "manual",
        required: true,
        client_visible: true,
        client_completable: true,
        completion_mode: "manual_client",
        due_offset_days: 30,
        sort_order: 10,
        metadata: { temporary: true },
      },
      {
        id: "template-item-2",
        title: "Planner final review",
        description: null,
        item_type: "admin",
        required: true,
        client_visible: false,
        client_completable: false,
        completion_mode: "manual_admin",
        due_offset_days: null,
        sort_order: 20,
        metadata: {},
      },
    ],
  });

  assert.deepEqual(inserts, [
    {
      event_id: "event-1",
      source_template_item_id: "template-item-1",
      title: "Confirm arrival details",
      description: "Review arrival time and location.",
      item_type: "manual",
      required: true,
      client_visible: true,
      client_completable: true,
      completion_mode: "manual_client",
      due_offset_days: 30,
      due_date_override: "2026-07-16",
      sort_order: 10,
      metadata: { temporary: true },
    },
    {
      event_id: "event-1",
      source_template_item_id: "template-item-2",
      title: "Planner final review",
      description: null,
      item_type: "admin",
      required: true,
      client_visible: false,
      client_completable: false,
      completion_mode: "manual_admin",
      due_offset_days: null,
      due_date_override: null,
      sort_order: 20,
      metadata: {},
    },
  ]);
});

test("buildEventChecklistItemInserts leaves due dates empty when the event date is unavailable", () => {
  const [insert] = buildEventChecklistItemInserts({
    eventDate: null,
    eventId: "event-1",
    templateItems: [
      {
        id: "template-item-1",
        title: "Confirm arrival details",
        description: null,
        item_type: "manual",
        required: false,
        client_visible: true,
        client_completable: false,
        completion_mode: "manual_admin",
        due_offset_days: 14,
        sort_order: 10,
        metadata: {},
      },
    ],
  });

  assert.equal(insert.due_date_override, null);
});
