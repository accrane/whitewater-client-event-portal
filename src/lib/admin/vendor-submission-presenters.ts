import type { Json } from "@/types/database";

type VendorReviewSource = {
  metadata: Json;
};

type VendorReviewEventSource = VendorReviewSource & {
  event_id: string;
};

export type VendorReviewSummary = {
  totalCount: number;
  needsReviewCount: number;
  label: string;
  hasVendorsNeedingReview: boolean;
};

export type BuildReviewedVendorMetadataInput = {
  existingMetadata: Json;
  reviewedAt?: string;
  reviewedBy: string | null;
};

export function buildVendorReviewSummary(
  vendors: VendorReviewSource[],
): VendorReviewSummary {
  const needsReviewCount = vendors.filter(isClientSubmittedVendorNeedingReview).length;

  return {
    totalCount: vendors.length,
    needsReviewCount,
    label:
      needsReviewCount > 0
        ? `${needsReviewCount} vendor submission${needsReviewCount === 1 ? "" : "s"} need planner review`
        : "No vendor submissions need planner review",
    hasVendorsNeedingReview: needsReviewCount > 0,
  };
}

export function buildVendorReviewCountsByEvent(
  vendors: VendorReviewEventSource[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const vendor of vendors) {
    if (!isClientSubmittedVendorNeedingReview(vendor)) {
      continue;
    }

    counts.set(vendor.event_id, (counts.get(vendor.event_id) ?? 0) + 1);
  }

  return counts;
}

export function isClientSubmittedVendorNeedingReview(
  vendor: VendorReviewSource,
): boolean {
  const metadata = getMetadataRecord(vendor.metadata);

  return metadata?.source === "client_portal" && metadata.status === "needs_review";
}

export function getVendorReviewClassName(metadata: Json): string {
  return isClientSubmittedVendorNeedingReview({ metadata })
    ? "rounded-2xl border border-amber-300 bg-amber-50 p-4"
    : "rounded-2xl border border-slate-200 bg-white p-4";
}

export function formatVendorReviewSourceLabel(metadata: Json): string {
  const source = getMetadataRecord(metadata)?.source;

  return source === "client_portal"
    ? "Client portal submission"
    : "Planner/admin record";
}

export function buildReviewedVendorMetadata({
  existingMetadata,
  reviewedAt,
  reviewedBy,
}: BuildReviewedVendorMetadataInput): Record<string, Json> {
  const reviewer = reviewedBy?.trim();

  if (!reviewer) {
    throw new Error("Unable to review vendor submission: reviewed by is required");
  }

  return {
    ...(getMetadataRecord(existingMetadata) ?? {}),
    status: "reviewed",
    reviewedAt: reviewedAt ?? new Date().toISOString(),
    reviewedBy: reviewer,
  };
}

function getMetadataRecord(metadata: Json): Record<string, Json | undefined> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata;
}
