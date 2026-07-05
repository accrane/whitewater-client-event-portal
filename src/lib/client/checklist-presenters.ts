import type { Database } from "@/types/database";

type ChecklistItemStatus = Database["public"]["Enums"]["checklist_item_status"];

export type ClientChecklistDisplaySource = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  client_visible: boolean;
  client_completable: boolean;
  status: ChecklistItemStatus;
  due_date_override: string | null;
  sort_order: number;
};

export type ClientChecklistDisplayItem = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  requiredLabel: string;
  status: ChecklistItemStatus;
  statusLabel: string;
  dueDate: string | null;
  dueDateLabel: string;
  clientCompletable: boolean;
  clientCompletableLabel: string;
};

export type ClientChecklistCompletionUpdate = {
  itemId: string;
  values: {
    status: "needs_review";
    completed_at: null;
    completed_by: null;
  };
};

export function buildClientChecklistDisplayItems(
  items: ClientChecklistDisplaySource[],
): ClientChecklistDisplayItem[] {
  return items
    .filter((item) => item.client_visible)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      id: item.id,
      title: item.title.trim(),
      description: normalizeOptionalText(item.description),
      required: item.required,
      requiredLabel: item.required ? "Required" : "Optional",
      status: item.status,
      statusLabel: formatStatusLabel(item.status),
      dueDate: item.due_date_override,
      dueDateLabel: item.due_date_override
        ? formatDisplayDate(item.due_date_override)
        : "No due date set",
      clientCompletable: item.client_completable,
      clientCompletableLabel: item.client_completable
        ? "You can mark this complete with your planner"
        : "Your planner will update this item",
    }));
}

export function buildClientChecklistCompletionUpdate({
  itemId,
}: {
  itemId: string;
}): ClientChecklistCompletionUpdate {
  const trimmedItemId = itemId.trim();

  if (!trimmedItemId) {
    throw new Error("Unable to update checklist item: missing checklist item ID");
  }

  return {
    itemId: trimmedItemId,
    values: {
      status: "needs_review",
      completed_at: null,
      completed_by: null,
    },
  };
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function formatStatusLabel(value: string): string {
  const label = value.replaceAll("_", " ");

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDisplayDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}
