import type { Json } from "@/types/database";

type UploadReviewSource = {
  metadata: Json;
  status: string;
};

type UploadReviewEventSource = UploadReviewSource & {
  event_id: string;
};

export type UploadReviewSummary = {
  totalCount: number;
  needsReviewCount: number;
  label: string;
  hasUploadsNeedingReview: boolean;
};

export type BuildReviewedUploadMetadataInput = {
  existingMetadata: Json;
  reviewedAt?: string;
  reviewedBy: string | null;
};

export function buildUploadReviewSummary(
  uploads: UploadReviewSource[],
): UploadReviewSummary {
  const needsReviewCount = uploads.filter(isClientUploadNeedingReview).length;

  return {
    totalCount: uploads.length,
    needsReviewCount,
    label:
      needsReviewCount > 0
        ? `${needsReviewCount} upload${needsReviewCount === 1 ? "" : "s"} need planner review`
        : "No uploads need planner review",
    hasUploadsNeedingReview: needsReviewCount > 0,
  };
}

export function buildUploadReviewCountsByEvent(
  uploads: UploadReviewEventSource[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const upload of uploads) {
    if (!isClientUploadNeedingReview(upload)) {
      continue;
    }

    counts.set(upload.event_id, (counts.get(upload.event_id) ?? 0) + 1);
  }

  return counts;
}

export function isClientUploadNeedingReview(upload: UploadReviewSource): boolean {
  const metadata = getMetadataRecord(upload.metadata);

  return (
    metadata?.source === "client_portal" &&
    (metadata.status === "needs_review" || upload.status === "needs_review")
  );
}

export function getUploadReviewClassName(upload: UploadReviewSource): string {
  return isClientUploadNeedingReview(upload)
    ? "rounded-2xl border border-amber-300 bg-amber-50 p-4"
    : "rounded-2xl border border-slate-200 bg-white p-4";
}

export function buildReviewedUploadMetadata({
  existingMetadata,
  reviewedAt,
  reviewedBy,
}: BuildReviewedUploadMetadataInput): Record<string, Json> {
  const reviewer = reviewedBy?.trim();

  if (!reviewer) {
    throw new Error("Unable to review upload: reviewed by is required");
  }

  return {
    ...(getMetadataRecord(existingMetadata) ?? {}),
    status: "reviewed",
    reviewedAt: reviewedAt ?? new Date().toISOString(),
    reviewedBy: reviewer,
  };
}

export function formatUploadFileSize(fileSizeBytes: number): string {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  const kilobytes = fileSizeBytes / 1024;

  if (kilobytes < 1024) {
    return `${formatNumber(kilobytes)} KB`;
  }

  return `${formatNumber(kilobytes / 1024)} MB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getMetadataRecord(metadata: Json): Record<string, Json | undefined> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata;
}
