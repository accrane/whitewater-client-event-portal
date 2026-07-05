import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientChecklistCompletionUpdate,
  buildClientChecklistDisplayItems,
} from "../../src/lib/client/checklist-presenters.ts";

test("buildClientChecklistDisplayItems keeps only client-visible items and formats checklist cues", () => {
  const displayItems = buildClientChecklistDisplayItems([
    {
      id: "visible-required",
      title: "  Confirm arrival time  ",
      description: "  Meet at the front gate.  ",
      required: true,
      client_visible: true,
      client_completable: true,
      status: "needs_review",
      due_date_override: "2026-08-01",
      sort_order: 20,
    },
    {
      id: "admin-only",
      title: "Internal planner review",
      description: null,
      required: true,
      client_visible: false,
      client_completable: false,
      status: "not_completed",
      due_date_override: null,
      sort_order: 10,
    },
  ]);

  assert.deepEqual(displayItems, [
    {
      id: "visible-required",
      title: "Confirm arrival time",
      description: "Meet at the front gate.",
      required: true,
      requiredLabel: "Required",
      status: "needs_review",
      statusLabel: "Needs review",
      dueDate: "2026-08-01",
      dueDateLabel: "August 1, 2026",
      clientCompletable: true,
      clientCompletableLabel: "You can mark this complete with your planner",
    },
  ]);
});

test("buildClientChecklistDisplayItems handles optional items without due dates", () => {
  const [displayItem] = buildClientChecklistDisplayItems([
    {
      id: "optional",
      title: "Share song requests",
      description: "",
      required: false,
      client_visible: true,
      client_completable: false,
      status: "not_completed",
      due_date_override: null,
      sort_order: 1,
    },
  ]);

  assert.equal(displayItem.description, null);
  assert.equal(displayItem.requiredLabel, "Optional");
  assert.equal(displayItem.statusLabel, "Not completed");
  assert.equal(displayItem.dueDateLabel, "No due date set");
  assert.equal(displayItem.clientCompletableLabel, "Your planner will update this item");
});

test("buildClientChecklistCompletionUpdate moves client-completable items to needs review", () => {
  const update = buildClientChecklistCompletionUpdate({
    itemId: " checklist-item-1 ",
  });

  assert.deepEqual(update, {
    itemId: "checklist-item-1",
    values: {
      status: "needs_review",
      completed_at: null,
      completed_by: null,
    },
  });
});

test("buildClientChecklistCompletionUpdate rejects blank item IDs", () => {
  assert.throws(
    () => buildClientChecklistCompletionUpdate({ itemId: "   " }),
    /missing checklist item ID/i,
  );
});
