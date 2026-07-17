import {
  buildClientChecklistCompletionUpdate,
  buildClientChecklistDisplayItems,
  type ClientChecklistDisplayItem,
} from "@/lib/client/checklist-presenters";
import {
  buildClientUploadInsert,
  buildClientUploadStoragePath,
  CLIENT_UPLOAD_BUCKET,
  validateClientUploadFile,
} from "@/lib/client/uploads";
import { buildClientVendorInsert, type ClientVendorSubmissionInput } from "@/lib/client/vendor-submissions";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/tokens";
import type { Database, Json } from "@/types/database";
import type { GhlEventSnapshot } from "@/types/portal";
import { randomUUID } from "node:crypto";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ChecklistRow = Database["public"]["Tables"]["event_checklist_items"]["Row"];
type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
type UploadRow = Database["public"]["Tables"]["uploads"]["Row"];

export type ClientPortalEvent = {
  id: string;
  eventName: string;
  eventType: string | null;
  eventDate: string | null;
  arrivalTime: string | null;
  meetingLocation: string | null;
  numberOfGuests: number | null;
  plannerName: string | null;
  plannerEmail: string | null;
  plannerPhone: string | null;
  proposalUrl: string | null;
  contractUrl: string | null;
  invoiceUrl: string | null;
  paymentUrl: string | null;
  paymentStatus: string | null;
  clientPortalUrl: string | null;
  checklistItems: ClientChecklistItem[];
  vendors: ClientVendor[];
  uploads: ClientUpload[];
};

export type ClientChecklistItem = ClientChecklistDisplayItem;

export type ClientVendor = {
  id: string;
  vendorType: string | null;
  companyName: string | null;
  contactName: string | null;
};

export type ClientUpload = {
  id: string;
  fileName: string;
  status: UploadRow["status"];
  uploadedAt: string;
};

export async function getClientPortalEventByToken(
  token: string,
): Promise<ClientPortalEvent | null> {
  const event = await getLaunchedPortalEventByToken(token);

  if (!event) {
    return null;
  }

  const supabase = createServiceRoleSupabaseClient();
  const [checklistResult, vendorResult, uploadResult] = await Promise.all([
    supabase
      .from("event_checklist_items")
      .select(
        "id, title, description, required, client_visible, client_completable, status, due_date_override, sort_order",
      )
      .eq("event_id", event.id)
      .eq("client_visible", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("vendors")
      .select("id, vendor_type, company_name, contact_name")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("uploads")
      .select("id, file_name, status, uploaded_at")
      .eq("event_id", event.id)
      .order("uploaded_at", { ascending: false })
      .limit(10),
  ]);

  if (checklistResult.error) {
    throw new Error(
      `Unable to load client checklist items: ${checklistResult.error.message}`,
    );
  }

  if (vendorResult.error) {
    throw new Error(`Unable to load client vendors: ${vendorResult.error.message}`);
  }

  if (uploadResult.error) {
    throw new Error(`Unable to load client uploads: ${uploadResult.error.message}`);
  }

  return mapEventToClientPortalEvent(
    event,
    checklistResult.data ?? [],
    vendorResult.data ?? [],
    uploadResult.data ?? [],
  );
}

export async function completeClientChecklistItemForToken({
  itemId,
  token,
}: {
  itemId: string;
  token: string;
}): Promise<void> {
  const event = await getLaunchedPortalEventByToken(token);

  if (!event) {
    throw new Error("Unable to update checklist item: portal link is not active");
  }

  const update = buildClientChecklistCompletionUpdate({ itemId });
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_checklist_items")
    .update(update.values as never)
    .eq("id", update.itemId)
    .eq("event_id", event.id)
    .eq("client_visible", true)
    .eq("client_completable", true)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to update checklist item: ${error.message}`);
  }

  if (!data) {
    throw new Error("Unable to update checklist item: item is not client-completable");
  }
}

// Client "Mark ready for planner review" on an FAQ checklist section. Only
// open sections can be submitted; completed or already-submitted sections
// wait on the planner.
export async function markClientChecklistSectionReadyForToken({
  sectionId,
  token,
}: {
  sectionId: string;
  token: string;
}): Promise<void> {
  const event = await getLaunchedPortalEventByToken(token);

  if (!event) {
    throw new Error(
      "Unable to update checklist section: portal link is not active",
    );
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_checklist_sections")
    .update({ status: "ready_for_review" } as never)
    .eq("id", sectionId)
    .eq("event_id", event.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to update checklist section: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "Unable to update checklist section: section is not open for submission",
    );
  }
}

export async function submitClientVendorForToken({
  token,
  vendor,
}: {
  token: string;
  vendor: Omit<ClientVendorSubmissionInput, "eventId">;
}): Promise<void> {
  const event = await getLaunchedPortalEventByToken(token);

  if (!event) {
    throw new Error("Unable to submit vendor: portal link is not active");
  }

  const insert = buildClientVendorInsert({
    ...vendor,
    eventId: event.id,
  });
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.from("vendors").insert(insert as never);

  if (error) {
    throw new Error(`Unable to submit vendor: ${error.message}`);
  }
}

export async function uploadClientFileForToken({
  file,
  token,
}: {
  file: File;
  token: string;
}): Promise<void> {
  const event = await getLaunchedPortalEventByToken(token);

  if (!event) {
    throw new Error("Unable to upload file: portal link is not active");
  }

  const validatedFile = validateClientUploadFile(file);
  const uploadId = randomUUID();
  const storagePath = buildClientUploadStoragePath({
    eventId: event.id,
    fileName: validatedFile.fileName,
    uploadId,
  });
  const insert = buildClientUploadInsert({
    eventId: event.id,
    fileName: validatedFile.fileName,
    fileMimeType: validatedFile.fileMimeType,
    fileSizeBytes: validatedFile.fileSizeBytes,
    storageBucket: CLIENT_UPLOAD_BUCKET,
    storagePath,
  });
  const supabase = createServiceRoleSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(CLIENT_UPLOAD_BUCKET)
    .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
      contentType: validatedFile.fileMimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Unable to upload file: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase.from("uploads").insert(insert as never);

  if (insertError) {
    await supabase.storage.from(CLIENT_UPLOAD_BUCKET).remove([storagePath]);
    throw new Error(`Unable to record upload: ${insertError.message}`);
  }
}

async function getLaunchedPortalEventByToken(token: string): Promise<EventRow | null> {
  const trimmedToken = token.trim();

  if (!trimmedToken || trimmedToken === "demo-token") {
    return null;
  }

  const tokenHash = await sha256Hex(trimmedToken);
  const supabase = createServiceRoleSupabaseClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("client_portal_token_hash", tokenHash)
    .eq("status", "launched")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load client portal event: ${error.message}`);
  }

  if (!event || isExpired(event as EventRow)) {
    return null;
  }

  return event as EventRow;
}

function mapEventToClientPortalEvent(
  event: EventRow,
  checklistItems: Pick<
    ChecklistRow,
    | "id"
    | "title"
    | "description"
    | "required"
    | "client_visible"
    | "client_completable"
    | "status"
    | "due_date_override"
    | "sort_order"
  >[],
  vendors: Pick<VendorRow, "id" | "vendor_type" | "company_name" | "contact_name">[],
  uploads: Pick<UploadRow, "id" | "file_name" | "status" | "uploaded_at">[],
): ClientPortalEvent {
  const snapshot = parseGhlSnapshot(event.ghl_snapshot);

  return {
    id: event.id,
    eventName: snapshot.eventName || "Your event",
    eventType: snapshot.eventType ?? null,
    eventDate: snapshot.eventDate ?? null,
    arrivalTime: snapshot.arrivalTime ?? null,
    meetingLocation: snapshot.meetingLocation ?? null,
    numberOfGuests: snapshot.numberOfGuests ?? null,
    plannerName: snapshot.planner?.name ?? null,
    plannerEmail: snapshot.planner?.email ?? null,
    plannerPhone: snapshot.planner?.phone ?? null,
    proposalUrl: snapshot.links?.proposal ?? null,
    contractUrl: snapshot.links?.contract ?? null,
    invoiceUrl: snapshot.links?.invoice ?? null,
    paymentUrl: snapshot.links?.payment ?? null,
    paymentStatus: snapshot.paymentStatus ?? null,
    clientPortalUrl: event.client_portal_url,
    checklistItems: buildClientChecklistDisplayItems(checklistItems),
    vendors: vendors.map((vendor) => ({
      id: vendor.id,
      vendorType: vendor.vendor_type,
      companyName: vendor.company_name,
      contactName: vendor.contact_name,
    })),
    uploads: uploads.map((upload) => ({
      id: upload.id,
      fileName: upload.file_name,
      status: upload.status,
      uploadedAt: upload.uploaded_at,
    })),
  };
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
    numberOfGuests: getNumber(raw.numberOfGuests),
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

function getNumber(value: Json | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isExpired(event: EventRow): boolean {
  if (event.expired_at) {
    return true;
  }

  return event.public_expires_at
    ? new Date(event.public_expires_at).getTime() < Date.now()
    : false;
}
