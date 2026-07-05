import type { Database } from "@/types/database";

type ChecklistItemStatus = Database["public"]["Enums"]["checklist_item_status"];

type ChecklistReviewSource = {
  status: ChecklistItemStatus;
};

type ChecklistReviewEventSource = ChecklistReviewSource & {
  event_id: string;
};

export type ChecklistReviewSummary = {
  totalCount: number;
  needsReviewCount: number;
  label: string;
  hasItemsNeedingReview: boolean;
};

export function buildChecklistReviewSummary(
  items: ChecklistReviewSource[],
): ChecklistReviewSummary {
  const needsReviewCount = items.filter(
    (item) => item.status === "needs_review",
  ).length;

  return {
    totalCount: items.length,
    needsReviewCount,
    label:
      needsReviewCount > 0
        ? `${needsReviewCount} item${needsReviewCount === 1 ? "" : "s"} need planner review`
        : "No checklist items need planner review",
    hasItemsNeedingReview: needsReviewCount > 0,
  };
}

export function buildChecklistReviewCountsByEvent(
  items: ChecklistReviewEventSource[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (item.status !== "needs_review") {
      continue;
    }

    counts.set(item.event_id, (counts.get(item.event_id) ?? 0) + 1);
  }

  return counts;
}

export function getChecklistReviewClassName(status: ChecklistItemStatus): string {
  return status === "needs_review"
    ? "grid gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4"
    : "grid gap-4 rounded-2xl border border-slate-200 bg-white p-4";
}
