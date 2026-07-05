import type { Database } from "@/types/database";

type ChecklistItemStatus = Database["public"]["Enums"]["checklist_item_status"];
type EventChecklistItemUpdate = Database["public"]["Tables"]["event_checklist_items"]["Update"];

const allowedStatuses = new Set<ChecklistItemStatus>([
  "not_completed",
  "needs_review",
  "completed",
  "not_applicable",
]);

export type BuildEventChecklistItemUpdateInput = {
  clientVisible: boolean;
  completedAt?: string;
  completedBy?: string | null;
  description: string | null;
  itemId: string;
  required: boolean;
  status: string;
  title: string;
};

export type EventChecklistItemUpdatePayload = {
  itemId: string;
  values: Pick<
    EventChecklistItemUpdate,
    | "title"
    | "description"
    | "required"
    | "client_visible"
    | "status"
    | "completed_at"
    | "completed_by"
  >;
};

export function buildEventChecklistItemUpdate(
  input: BuildEventChecklistItemUpdateInput,
): EventChecklistItemUpdatePayload {
  const itemId = input.itemId.trim();

  if (!itemId) {
    throw new Error("Unable to update checklist item: missing checklist item ID");
  }

  const title = input.title.trim();

  if (!title) {
    throw new Error("Unable to update checklist item: title is required");
  }

  if (!isChecklistItemStatus(input.status)) {
    throw new Error(`Unable to update checklist item: invalid checklist status ${input.status}`);
  }

  const completedFields = getCompletedFields({
    completedAt: input.completedAt,
    completedBy: input.completedBy,
    status: input.status,
  });

  return {
    itemId,
    values: {
      title,
      description: normalizeOptionalText(input.description),
      required: input.required,
      client_visible: input.clientVisible,
      status: input.status,
      completed_at: completedFields.completedAt,
      completed_by: completedFields.completedBy,
    },
  };
}

function isChecklistItemStatus(value: string): value is ChecklistItemStatus {
  return allowedStatuses.has(value as ChecklistItemStatus);
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function getCompletedFields({
  completedAt,
  completedBy,
  status,
}: {
  completedAt: string | undefined;
  completedBy: string | null | undefined;
  status: ChecklistItemStatus;
}): { completedAt: string | null; completedBy: string | null } {
  if (status !== "completed") {
    return { completedAt: null, completedBy: null };
  }

  return {
    completedAt: completedAt ?? new Date().toISOString(),
    completedBy: completedBy?.trim() || "admin",
  };
}
