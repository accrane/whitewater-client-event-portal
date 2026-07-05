import assert from "node:assert/strict";
import test from "node:test";

import { buildEventChecklistItemUpdate } from "../../src/lib/admin/checklist-item-editors.ts";

test("buildEventChecklistItemUpdate trims editable text fields and preserves planner checklist flags", () => {
  const update = buildEventChecklistItemUpdate({
    clientVisible: true,
    description: "  Send final menu choices.  ",
    itemId: "item-1",
    required: false,
    status: "needs_review",
    title: "  Final menu  ",
  });

  assert.deepEqual(update, {
    itemId: "item-1",
    values: {
      title: "Final menu",
      description: "Send final menu choices.",
      required: false,
      client_visible: true,
      status: "needs_review",
      completed_at: null,
      completed_by: null,
    },
  });
});

test("buildEventChecklistItemUpdate marks planner completions with audit fields", () => {
  const update = buildEventChecklistItemUpdate({
    clientVisible: false,
    completedAt: "2026-07-02T12:00:00.000Z",
    completedBy: "planner@example.com",
    description: "",
    itemId: "item-2",
    required: true,
    status: "completed",
    title: "Planner review",
  });

  assert.equal(update.values.description, null);
  assert.equal(update.values.completed_at, "2026-07-02T12:00:00.000Z");
  assert.equal(update.values.completed_by, "planner@example.com");
});

test("buildEventChecklistItemUpdate rejects invalid status and blank required identifiers", () => {
  assert.throws(
    () =>
      buildEventChecklistItemUpdate({
        clientVisible: true,
        description: null,
        itemId: "item-3",
        required: true,
        status: "waiting" ,
        title: "Task",
      }),
    /invalid checklist status/i,
  );

  assert.throws(
    () =>
      buildEventChecklistItemUpdate({
        clientVisible: true,
        description: null,
        itemId: "  ",
        required: true,
        status: "not_completed",
        title: "Task",
      }),
    /missing checklist item ID/i,
  );
});
