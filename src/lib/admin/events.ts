import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { GhlEventSnapshot } from "@/types/portal";

import { buildChecklistReviewCountsByEvent } from "./checklist-review-presenters";
import { buildReviewedUploadMetadata } from "./upload-review-presenters";
import {
  buildReviewedVendorMetadata,
  buildVendorReviewCountsByEvent,
} from "./vendor-submission-presenters";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventChecklistItemRow = Database["public"]["Tables"]["event_checklist_items"]["Row"];
type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
type UploadRow = Database["public"]["Tables"]["uploads"]["Row"];

export type AdminEventListItem = {
  id: string;
  ghlEventRecordId: string;
  status: EventRow["status"];
  eventName: string;
  eventType: string | null;
  eventDate: string | null;
  plannerName: string | null;
  clientPortalUrl: string | null;
  launchedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: EventRow["last_sync_status"];
  checklistReviewCount: number;
  vendorReviewCount: number;
  createdAt: string;
};

export type AdminEventDetail = AdminEventListItem & {
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  hasPortalTokenHash: boolean;
  publicExpiresAt: string | null;
  expiredAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  lastSyncError: string | null;
  updatedAt: string;
  arrivalTime: string | null;
  meetingLocation: string | null;
  plannerEmail: string | null;
  plannerPhone: string | null;
  proposalUrl: string | null;
  contractUrl: string | null;
  invoiceUrl: string | null;
  paymentUrl: string | null;
  paymentStatus: string | null;
};

export type AdminEventVendor = {
  id: string;
  vendorType: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  metadata: Json;
  createdAt: string;
};

export type AdminEventUpload = {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  storageBucket: string;
  storagePath: string;
  status: UploadRow["status"];
  uploadedBy: string;
  uploadedAt: string;
  metadata: Json;
  signedUrl: string | null;
};

export async function listAdminEvents(): Promise<AdminEventListItem[]> {
  const supabase = createServiceRoleSupabaseClient();

  const [eventsResult, reviewItemsResult, reviewVendorsResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, ghl_event_record_id, status, client_portal_url, launched_at, last_synced_at, last_sync_status, ghl_snapshot, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("event_checklist_items")
      .select("event_id, status")
      .eq("status", "needs_review"),
    supabase.from("vendors").select("event_id, metadata"),
  ]);

  if (eventsResult.error) {
    throw new Error(`Unable to load admin events: ${eventsResult.error.message}`);
  }

  if (reviewItemsResult.error) {
    throw new Error(
      `Unable to load checklist review counts: ${reviewItemsResult.error.message}`,
    );
  }

  if (reviewVendorsResult.error) {
    throw new Error(
      `Unable to load vendor review counts: ${reviewVendorsResult.error.message}`,
    );
  }

  const reviewCounts = buildChecklistReviewCountsByEvent(
    (reviewItemsResult.data ?? []) as Pick<
      EventChecklistItemRow,
      "event_id" | "status"
    >[],
  );
  const vendorReviewCounts = buildVendorReviewCountsByEvent(
    (reviewVendorsResult.data ?? []) as Pick<VendorRow, "event_id" | "metadata">[],
  );

  const eventRows = (eventsResult.data ?? []) as Pick<
    EventRow,
    | "id"
    | "ghl_event_record_id"
    | "status"
    | "client_portal_url"
    | "launched_at"
    | "last_synced_at"
    | "last_sync_status"
    | "ghl_snapshot"
    | "created_at"
  >[];

  return eventRows.map((row) =>
    mapEventRowToListItem({
      row,
      checklistReviewCount: reviewCounts.get(row.id) ?? 0,
      vendorReviewCount: vendorReviewCounts.get(row.id) ?? 0,
    }),
  );
}

export async function getAdminEventById(
  eventId: string,
): Promise<AdminEventDetail | null> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load admin event: ${error.message}`);
  }

  return data ? mapEventRowToDetail(data) : null;
}

export async function listEventVendors(
  eventId: string,
): Promise<AdminEventVendor[]> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("vendors")
    .select(
      "id, vendor_type, company_name, contact_name, email, phone, notes, metadata, created_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load event vendors: ${error.message}`);
  }

  return ((data ?? []) as Pick<
    VendorRow,
    | "id"
    | "vendor_type"
    | "company_name"
    | "contact_name"
    | "email"
    | "phone"
    | "notes"
    | "metadata"
    | "created_at"
  >[]).map(mapVendorRowToAdminVendor);
}

export async function listEventUploads(
  eventId: string,
): Promise<AdminEventUpload[]> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      "id, file_name, file_mime_type, file_size_bytes, storage_bucket, storage_path, status, uploaded_by, uploaded_at, metadata",
    )
    .eq("event_id", eventId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load event uploads: ${error.message}`);
  }

  const uploads = ((data ?? []) as Pick<
    UploadRow,
    | "id"
    | "file_name"
    | "file_mime_type"
    | "file_size_bytes"
    | "storage_bucket"
    | "storage_path"
    | "status"
    | "uploaded_by"
    | "uploaded_at"
    | "metadata"
  >[]).map(mapUploadRowToAdminUpload);

  return Promise.all(
    uploads.map(async (upload) => ({
      ...upload,
      signedUrl: await createUploadSignedUrl(upload),
    })),
  );
}

export async function markEventVendorReviewed({
  eventId,
  reviewedBy,
  vendorId,
}: {
  eventId: string;
  reviewedBy: string | null;
  vendorId: string;
}): Promise<void> {
  const trimmedEventId = eventId.trim();
  const trimmedVendorId = vendorId.trim();

  if (!trimmedEventId) {
    throw new Error("Unable to review vendor submission: missing event ID");
  }

  if (!trimmedVendorId) {
    throw new Error("Unable to review vendor submission: missing vendor ID");
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data: vendor, error: loadError } = await supabase
    .from("vendors")
    .select("id, metadata")
    .eq("id", trimmedVendorId)
    .eq("event_id", trimmedEventId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Unable to load vendor submission: ${loadError.message}`);
  }

  if (!vendor) {
    throw new Error("Unable to review vendor submission: vendor not found for event");
  }

  const metadata = buildReviewedVendorMetadata({
    existingMetadata: (vendor as Pick<VendorRow, "metadata">).metadata,
    reviewedBy,
  });

  const { error: updateError } = await supabase
    .from("vendors")
    .update({ metadata } as never)
    .eq("id", trimmedVendorId)
    .eq("event_id", trimmedEventId);

  if (updateError) {
    throw new Error(`Unable to review vendor submission: ${updateError.message}`);
  }
}

export async function markEventUploadReviewed({
  eventId,
  reviewedBy,
  uploadId,
}: {
  eventId: string;
  reviewedBy: string | null;
  uploadId: string;
}): Promise<void> {
  const trimmedEventId = eventId.trim();
  const trimmedUploadId = uploadId.trim();

  if (!trimmedEventId) {
    throw new Error("Unable to review upload: missing event ID");
  }

  if (!trimmedUploadId) {
    throw new Error("Unable to review upload: missing upload ID");
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data: upload, error: loadError } = await supabase
    .from("uploads")
    .select("id, metadata")
    .eq("id", trimmedUploadId)
    .eq("event_id", trimmedEventId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Unable to load upload: ${loadError.message}`);
  }

  if (!upload) {
    throw new Error("Unable to review upload: upload not found for event");
  }

  const metadata = buildReviewedUploadMetadata({
    existingMetadata: (upload as Pick<UploadRow, "metadata">).metadata,
    reviewedBy,
  });

  const { error: updateError } = await supabase
    .from("uploads")
    .update({ metadata, status: "uploaded" } as never)
    .eq("id", trimmedUploadId)
    .eq("event_id", trimmedEventId);

  if (updateError) {
    throw new Error(`Unable to review upload: ${updateError.message}`);
  }
}

function mapEventRowToListItem({
  row,
  checklistReviewCount = 0,
  vendorReviewCount = 0,
}: {
  row: Pick<
    EventRow,
    | "id"
    | "ghl_event_record_id"
    | "status"
    | "client_portal_url"
    | "launched_at"
    | "last_synced_at"
    | "last_sync_status"
    | "ghl_snapshot"
    | "created_at"
  >;
  checklistReviewCount?: number;
  vendorReviewCount?: number;
}): AdminEventListItem {
  const snapshot = parseGhlSnapshot(row.ghl_snapshot);

  return {
    id: row.id,
    ghlEventRecordId: row.ghl_event_record_id,
    status: row.status,
    eventName: snapshot.eventName || "Untitled event",
    eventType: snapshot.eventType ?? null,
    eventDate: snapshot.eventDate ?? null,
    plannerName: snapshot.planner?.name ?? null,
    clientPortalUrl: row.client_portal_url,
    launchedAt: row.launched_at,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status,
    checklistReviewCount,
    vendorReviewCount,
    createdAt: row.created_at,
  };
}

function mapEventRowToDetail(row: EventRow): AdminEventDetail {
  const snapshot = parseGhlSnapshot(row.ghl_snapshot);

  return {
    ...mapEventRowToListItem({ row }),
    ghlContactId: row.ghl_contact_id,
    ghlOpportunityId: row.ghl_opportunity_id,
    hasPortalTokenHash: Boolean(row.client_portal_token_hash),
    publicExpiresAt: row.public_expires_at,
    expiredAt: row.expired_at,
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
    lastSyncError: row.last_sync_error,
    updatedAt: row.updated_at,
    arrivalTime: snapshot.arrivalTime ?? null,
    meetingLocation: snapshot.meetingLocation ?? null,
    plannerEmail: snapshot.planner?.email ?? null,
    plannerPhone: snapshot.planner?.phone ?? null,
    proposalUrl: snapshot.links?.proposal ?? null,
    contractUrl: snapshot.links?.contract ?? null,
    invoiceUrl: snapshot.links?.invoice ?? null,
    paymentUrl: snapshot.links?.payment ?? null,
    paymentStatus: snapshot.paymentStatus ?? null,
  };
}

function mapVendorRowToAdminVendor(
  row: Pick<
    VendorRow,
    | "id"
    | "vendor_type"
    | "company_name"
    | "contact_name"
    | "email"
    | "phone"
    | "notes"
    | "metadata"
    | "created_at"
  >,
): AdminEventVendor {
  return {
    id: row.id,
    vendorType: row.vendor_type,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function mapUploadRowToAdminUpload(
  row: Pick<
    UploadRow,
    | "id"
    | "file_name"
    | "file_mime_type"
    | "file_size_bytes"
    | "storage_bucket"
    | "storage_path"
    | "status"
    | "uploaded_by"
    | "uploaded_at"
    | "metadata"
  >,
): AdminEventUpload {
  return {
    id: row.id,
    fileName: row.file_name,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: row.file_size_bytes,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    status: row.status,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    metadata: row.metadata,
    signedUrl: null,
  };
}

async function createUploadSignedUrl(upload: AdminEventUpload): Promise<string | null> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.storage
    .from(upload.storageBucket)
    .createSignedUrl(upload.storagePath, 60 * 10);

  if (error) {
    console.error("Failed creating upload signed URL", error.message);
    return null;
  }

  return data.signedUrl;
}

function parseGhlSnapshot(snapshot: Json): GhlEventSnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {};
  }

  const raw = snapshot as Record<string, Json | undefined>;
  const planner = raw.planner;

  return {
    eventName: getString(raw.eventName),
    eventType: getString(raw.eventType),
    eventDate: getString(raw.eventDate),
    arrivalTime: getString(raw.arrivalTime),
    meetingLocation: getString(raw.meetingLocation),
    planner:
      planner && typeof planner === "object" && !Array.isArray(planner)
        ? {
            name: getString((planner as Record<string, Json | undefined>).name),
            email: getString((planner as Record<string, Json | undefined>).email),
            phone:
              getString((planner as Record<string, Json | undefined>).phone) ?? null,
          }
        : undefined,
    links: parseLinks(raw.links),
    paymentStatus: getString(raw.paymentStatus),
  };
}

function parseLinks(value: Json | undefined): GhlEventSnapshot["links"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const links = value as Record<string, Json | undefined>;

  return {
    proposal: getString(links.proposal),
    contract: getString(links.contract),
    invoice: getString(links.invoice),
    payment: getString(links.payment),
  };
}

function getString(value: Json | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
