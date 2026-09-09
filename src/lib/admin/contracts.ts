import { setEventReservationsStatus } from "@/lib/admin/room-calendar";
import { getAdminEventById, type AdminEventDetail } from "@/lib/admin/events";
import { formatDisplayDate } from "@/lib/dates";
import { appConfig } from "@/lib/env";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { moveOpportunityToBooked } from "@/lib/ghl/opportunity-sync";
import { isPandaDocConfigured } from "@/lib/pandadoc/client";
import {
  createPandaDocDocument,
  createPandaDocSigningSession,
  downloadPandaDocDocument,
  getPandaDocDocumentDetails,
  getPandaDocTemplateDetails,
  listPandaDocTemplates,
  movePandaDocDocumentToDraft,
  pandaDocDocumentUrl,
  pandaDocSigningUrl,
  sendPandaDocDocument,
  updatePandaDocDocument,
  waitForPandaDocDraft,
  type PandaDocTemplateSummary,
} from "@/lib/pandadoc/documents";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import {
  EDITABLE_CONTRACT_STATUSES,
  OPEN_CONTRACT_STATUSES,
  SIGNABLE_CONTRACT_STATUSES,
  calculateContractSubtotal,
  parseContractLineItems,
  toNumber,
  type ClientContract,
  type ContractLineItem,
  type ContractStatus,
  type EventContract,
} from "@/lib/contracts/shared";
import type { Database } from "@/types/database";

export {
  calculateContractSubtotal,
  contractStatusLabels,
  parseContractLineItems,
} from "@/lib/contracts/shared";
export type {
  ClientContract,
  ContractLineItem,
  ContractStatus,
  EventContract,
} from "@/lib/contracts/shared";

// PandaDoc contracts on an event (admin Contracts tab + portal signing).
// The app owns the record of what was sent (name, description, line
// items); PandaDoc owns signing. Status flows back three ways — page-load
// refresh, the portal's embedded signer reporting completion, and the
// PandaDoc webhook — and all three funnel through syncContractFromPandaDoc,
// which runs the signed-contract side effects exactly once.

type ContractRow = Database["public"]["Tables"]["event_contracts"]["Row"];
type ContractInsert = Database["public"]["Tables"]["event_contracts"]["Insert"];
type ContractUpdate = Database["public"]["Tables"]["event_contracts"]["Update"];
type EventRow = Database["public"]["Tables"]["events"]["Row"];

function mapContractRow(
  row: ContractRow,
  signedPdfUrl: string | null,
): EventContract {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    lineItems: parseContractLineItems(row.line_items),
    subtotal: toNumber(row.subtotal) ?? 0,
    status: row.status,
    pandadocDocumentId: row.pandadoc_document_id,
    pandadocTemplateId: row.pandadoc_template_id,
    pandadocStatus: row.pandadoc_status,
    pandadocUrl: row.pandadoc_url,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    grandTotal: toNumber(row.grand_total),
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    completedAt: row.completed_at,
    signedActionsAppliedAt: row.signed_actions_applied_at,
    signedPdfUrl,
    lastError: row.last_error,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    revisedAt: row.revised_at,
    revisedBy: row.revised_by,
  };
}

async function signedPdfUrlFor(row: ContractRow): Promise<string | null> {
  if (!row.signed_pdf_bucket || !row.signed_pdf_path) return null;
  const supabase = createServiceRoleSupabaseClient();
  const { data } = await supabase.storage
    .from(row.signed_pdf_bucket)
    .createSignedUrl(row.signed_pdf_path, 60 * 10);
  return data?.signedUrl ?? null;
}

// Newest first. withSignedUrls mints short-lived PDF links (admin views).
export async function listEventContracts(
  eventId: string,
  options: { withSignedUrls?: boolean } = {},
): Promise<EventContract[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to load contracts: ${error.message}`);

  const rows = (data ?? []) as ContractRow[];
  return Promise.all(
    rows.map(async (row) =>
      mapContractRow(
        row,
        options.withSignedUrls ? await signedPdfUrlFor(row) : null,
      ),
    ),
  );
}

async function getContractRow(contractId: string): Promise<ContractRow | null> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load contract: ${error.message}`);
  return (data as ContractRow | null) ?? null;
}

async function getContractRowByDocumentId(
  documentId: string,
): Promise<ContractRow | null> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("pandadoc_document_id", documentId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load contract: ${error.message}`);
  return (data as ContractRow | null) ?? null;
}

async function updateContractRow(
  contractId: string,
  patch: ContractUpdate,
): Promise<ContractRow> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .update(patch as never)
    .eq("id", contractId)
    .select("*")
    .single();
  if (error) throw new Error(`Unable to update contract: ${error.message}`);
  return data as ContractRow;
}

export type ContractTemplateOptions = {
  configured: boolean;
  templates: PandaDocTemplateSummary[];
  defaultTemplateId: string | null;
  error: string | null;
};

// Template picker data for the Contracts tab. Never throws: an unconfigured
// or unreachable PandaDoc shows as an explanation in the form instead.
export async function getContractTemplateOptions(): Promise<ContractTemplateOptions> {
  if (!isPandaDocConfigured()) {
    return {
      configured: false,
      templates: [],
      defaultTemplateId: null,
      error:
        "PandaDoc isn't connected yet — add PANDADOC_API_KEY (and optionally PANDADOC_TEMPLATE_ID) to .env.local.",
    };
  }

  const result = await listPandaDocTemplates();
  return {
    configured: true,
    templates: result.ok ? result.data : [],
    defaultTemplateId: appConfig.pandadoc.defaultTemplateId ?? null,
    error: result.ok ? null : result.error,
  };
}

// Document tokens available to templates as [event.name], [contact.email],
// [contract.description], ... Missing values send as empty strings so the
// template shows a blank rather than the raw tag.
export function buildContractTokens(
  event: AdminEventDetail,
  contract: { name: string; description: string | null; subtotal: number },
  recipient: { firstName: string; lastName: string; email: string },
): Record<string, string> {
  const text = (value: string | number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);

  return {
    "event.name": text(event.eventName),
    "event.type": text(event.eventType),
    "event.date": event.eventDate ? formatDisplayDate(event.eventDate) : "",
    "event.arrival_time": text(event.arrivalTime),
    "event.meeting_location": text(event.meetingLocation),
    "event.num_attendees": text(event.numberOfGuests),
    "event.activity_passes": text(event.activityPassCount),
    "event.parking_passes": text(event.numberOfParkingPasses),
    "event.storage_bins": text(event.numberOfStorageBins),
    "contact.name": text(event.contactName),
    "contact.email": text(event.contactEmail),
    "contact.phone": text(event.contactPhone),
    "planner.name": text(event.plannerName),
    "planner.email": text(event.plannerEmail),
    "planner.phone": text(event.plannerPhone),
    "facilitator.name": text(event.facilitatorName),
    "facilitator.email": text(event.facilitatorEmail),
    "facilitator.phone": text(event.facilitatorPhone),
    "contract.name": contract.name,
    "contract.description": text(contract.description),
    "contract.subtotal": money(contract.subtotal),
    // The existing Whitewater templates were built for PandaDoc's Salesforce
    // integration and use these names; fill them so those templates work
    // unchanged.
    "Client.FirstName": recipient.firstName,
    "Client.LastName": recipient.lastName,
    "Client.Email": recipient.email,
    "Client.Phone": text(event.contactPhone),
    // The event has no company field yet; blank keeps the template tidy.
    "Account.Name": "",
    Date__c: event.eventDate ? formatDisplayDate(event.eventDate) : "",
  };
}

export type CreateEventContractInput = {
  eventId: string;
  name: string;
  description: string | null;
  lineItems: ContractLineItem[];
  templateId: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  // true → PandaDoc also emails its signing invite; false → silent send,
  // the client signs from the portal.
  notifyByEmail: boolean;
  createdBy: string | null;
};

export type CreateEventContractOutcome =
  | { ok: true; contract: EventContract }
  | { ok: false; error: string; contract?: EventContract };

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Client", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Trims, drops nameless rows, and rounds prices to cents.
function normalizeLineItems(items: ContractLineItem[]): ContractLineItem[] {
  return items
    .map((item) => ({
      name: item.name.trim(),
      description: item.description.trim(),
      quantity:
        Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      unitPrice: Number.isFinite(item.unitPrice)
        ? Math.round(item.unitPrice * 100) / 100
        : 0,
    }))
    .filter((item) => item.name);
}

function toLineItemsJson(items: ContractLineItem[]) {
  return items.map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));
}

function pickClientRole(roles: string[]): string {
  return (
    roles.find((role) => /client|customer|signer/i.test(role)) ??
    roles[0] ??
    "Client"
  );
}

// Creates the contract record, then the PandaDoc document from the chosen
// template with the app's line items as its pricing table, waits for
// PandaDoc to finish building it, and sends it (silently by default). The
// row persists even when PandaDoc fails, carrying the error, so the
// planner can see what happened and retry.
export async function createEventContract(
  input: CreateEventContractInput,
): Promise<CreateEventContractOutcome> {
  const event = await getAdminEventById(input.eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the contract a name." };

  const lineItems = normalizeLineItems(input.lineItems);
  const subtotal = calculateContractSubtotal(lineItems);

  const recipientName = (input.recipientName ?? event.contactName ?? "").trim();
  const recipientEmail = (input.recipientEmail ?? event.contactEmail ?? "")
    .trim()
    .toLowerCase();
  if (!recipientEmail) {
    return {
      ok: false,
      error:
        "The contract needs a recipient email. The GHL contact has none on file — enter one here.",
    };
  }

  const templateId = (
    input.templateId ??
    appConfig.pandadoc.defaultTemplateId ??
    ""
  ).trim();
  if (!templateId) {
    return {
      ok: false,
      error:
        "Pick a PandaDoc template (or set PANDADOC_TEMPLATE_ID as the default).",
    };
  }

  const supabase = createServiceRoleSupabaseClient();
  const insert: ContractInsert = {
    event_id: event.id,
    name,
    description: input.description?.trim() || null,
    line_items: toLineItemsJson(lineItems),
    subtotal,
    status: "creating",
    pandadoc_template_id: templateId,
    recipient_name: recipientName || null,
    recipient_email: recipientEmail,
    created_by: input.createdBy,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("event_contracts")
    .insert(insert as never)
    .select("*")
    .single();
  if (insertError) {
    return {
      ok: false,
      error: `Unable to save the contract: ${insertError.message}`,
    };
  }
  let row = inserted as ContractRow;

  const fail = async (error: string): Promise<CreateEventContractOutcome> => {
    row = await updateContractRow(row.id, {
      status: "error",
      last_error: error,
    });
    await logIntegrationEvent({
      direction: "PORTAL_TO_PANDADOC",
      eventType: "contract_create",
      ghlLocationId: appConfig.ghl.locationId ?? null,
      portalEventId: event.id,
      status: "error",
      message: "Failed creating the PandaDoc contract.",
      details: { contract_id: row.id, error },
    });
    return { ok: false, error, contract: mapContractRow(row, null) };
  };

  if (!isPandaDocConfigured()) {
    return fail("PandaDoc isn't connected yet (PANDADOC_API_KEY is empty).");
  }

  // Template shape decides the recipient role and where line items go.
  const template = await getPandaDocTemplateDetails(templateId);
  if (!template.ok) return fail(template.error);

  const pricingTableName = template.data.pricingTableNames[0] ?? null;
  const recipient = { email: recipientEmail, ...splitName(recipientName) };
  const created = await createPandaDocDocument({
    name,
    templateId,
    recipient: { ...recipient, role: pickClientRole(template.data.roles) },
    tokens: buildContractTokens(
      event,
      { name, description: insert.description ?? null, subtotal },
      recipient,
    ),
    pricingTable:
      pricingTableName && lineItems.length > 0
        ? {
            name: pricingTableName,
            rows: lineItems.map((item) => ({
              name: item.name,
              description: item.description,
              price: item.unitPrice,
              qty: item.quantity,
            })),
          }
        : null,
    metadata: { portal_event_id: event.id, portal_contract_id: row.id },
  });
  if (!created.ok) return fail(created.error);

  row = await updateContractRow(row.id, {
    pandadoc_document_id: created.data.id,
    pandadoc_url: pandaDocDocumentUrl(created.data.id),
  });

  const ready = await waitForPandaDocDraft(created.data.id);
  if (!ready.ok) return fail(ready.error);

  const sent = await sendPandaDocDocument(created.data.id, {
    subject: `${name} — ${event.eventName}`,
    message: `Please review and sign the contract for ${event.eventName}.`,
    silent: !input.notifyByEmail,
  });
  if (!sent.ok) return fail(sent.error);

  row = await updateContractRow(row.id, {
    status: "sent",
    pandadoc_status: "document.sent",
    sent_at: new Date().toISOString(),
    last_error: null,
  });

  await logIntegrationEvent({
    direction: "PORTAL_TO_PANDADOC",
    eventType: "contract_create",
    portalEventId: event.id,
    status: "success",
    message: input.notifyByEmail
      ? "PandaDoc contract created and emailed to the client."
      : "PandaDoc contract created; client signs from the portal.",
    details: {
      contract_id: row.id,
      pandadoc_document_id: created.data.id,
      subtotal,
      line_item_count: lineItems.length,
    },
  });

  // Pull PandaDoc's computed total right away so the tab shows it.
  const synced = await syncContractFromPandaDoc(row);
  return { ok: true, contract: mapContractRow(synced ?? row, null) };
}

export type UpdateEventContractInput = {
  eventId: string;
  contractId: string;
  name: string;
  description: string | null;
  lineItems: ContractLineItem[];
  notifyByEmail: boolean;
  updatedBy: string | null;
};

// Edits an unsigned contract in place: the PandaDoc document goes back to
// draft (signature fields clear, nothing is emailed), gets the new name,
// terms and line items, and is sent again. The client's earlier signing
// link stops working and the portal shows the revised contract. Signed
// contracts are refused — changes after signing are a new contract.
export async function updateEventContract(
  input: UpdateEventContractInput,
): Promise<CreateEventContractOutcome> {
  const event = await getAdminEventById(input.eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const found = await getContractRow(input.contractId);
  if (!found || found.event_id !== event.id || !found.pandadoc_document_id) {
    return { ok: false, error: "Contract not found." };
  }
  let row: ContractRow = found;
  const documentId = found.pandadoc_document_id;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the contract a name." };
  const description = input.description?.trim() || null;
  const lineItems = normalizeLineItems(input.lineItems);
  const subtotal = calculateContractSubtotal(lineItems);

  if (!isPandaDocConfigured()) {
    return {
      ok: false,
      error: "PandaDoc isn't connected yet (PANDADOC_API_KEY is empty).",
    };
  }

  // Re-read PandaDoc first so a contract the client signed a moment ago is
  // never reopened underneath them.
  row = (await syncContractFromPandaDoc(row)) ?? row;
  if (!EDITABLE_CONTRACT_STATUSES.includes(row.status)) {
    return {
      ok: false,
      error:
        row.status === "completed"
          ? `This contract was signed${
              row.completed_at
                ? ` on ${formatDisplayDate(row.completed_at.slice(0, 10))}`
                : ""
            } and can't be changed. Create a new contract for the changes.`
          : "This contract is no longer open and can't be edited.",
      contract: mapContractRow(row, null),
    };
  }

  const fail = async (error: string): Promise<CreateEventContractOutcome> => {
    row = await updateContractRow(row.id, { last_error: error });
    await logIntegrationEvent({
      direction: "PORTAL_TO_PANDADOC",
      eventType: "contract_update",
      ghlLocationId: appConfig.ghl.locationId ?? null,
      portalEventId: event.id,
      status: "error",
      message: "Failed updating the PandaDoc contract.",
      details: { contract_id: row.id, pandadoc_document_id: documentId, error },
    });
    return { ok: false, error, contract: mapContractRow(row, null) };
  };

  // Where the line items go is decided by the template it was built from.
  let pricingTableName: string | null = null;
  if (row.pandadoc_template_id) {
    const template = await getPandaDocTemplateDetails(row.pandadoc_template_id);
    if (!template.ok) return fail(template.error);
    pricingTableName = template.data.pricingTableNames[0] ?? null;
  }

  // A re-send that failed halfway leaves the document already in draft;
  // PandaDoc rejects moving a draft to draft, so only move when needed.
  if (row.pandadoc_status !== "document.draft") {
    const toDraft = await movePandaDocDocumentToDraft(documentId);
    if (!toDraft.ok) return fail(toDraft.error);
  }

  // From here the PandaDoc document is a draft: mirror that so a failure in
  // a later step leaves the contract editable (and hidden from the portal)
  // rather than looking signable.
  row = await updateContractRow(row.id, {
    status: "draft",
    pandadoc_status: "document.draft",
  });

  const updated = await updatePandaDocDocument(documentId, {
    name,
    tokens: buildContractTokens(
      event,
      { name, description, subtotal },
      {
        email: row.recipient_email ?? "",
        ...splitName(row.recipient_name ?? ""),
      },
    ),
    pricingTable:
      pricingTableName && lineItems.length > 0
        ? {
            name: pricingTableName,
            rows: lineItems.map((item) => ({
              name: item.name,
              description: item.description,
              price: item.unitPrice,
              qty: item.quantity,
            })),
          }
        : null,
    metadata: { portal_event_id: event.id, portal_contract_id: row.id },
  });
  if (!updated.ok) return fail(updated.error);

  // The app's record now matches what PandaDoc holds, even if the send
  // below fails and the planner has to retry.
  row = await updateContractRow(row.id, {
    name,
    description,
    line_items: toLineItemsJson(lineItems),
    subtotal,
  });

  const ready = await waitForPandaDocDraft(documentId);
  if (!ready.ok) return fail(ready.error);

  const sent = await sendPandaDocDocument(documentId, {
    subject: `${name} — ${event.eventName} (updated)`,
    message: `The contract for ${event.eventName} was updated. Please review and sign the latest version.`,
    silent: !input.notifyByEmail,
  });
  if (!sent.ok) return fail(sent.error);

  const now = new Date().toISOString();
  row = await updateContractRow(row.id, {
    status: "sent",
    pandadoc_status: "document.sent",
    sent_at: now,
    viewed_at: null,
    revision: row.revision + 1,
    revised_at: now,
    revised_by: input.updatedBy,
    last_error: null,
  });

  await logIntegrationEvent({
    direction: "PORTAL_TO_PANDADOC",
    eventType: "contract_update",
    portalEventId: event.id,
    status: "success",
    message: input.notifyByEmail
      ? `Contract updated (revision ${row.revision}) and re-emailed to the client.`
      : `Contract updated (revision ${row.revision}); client re-signs from the portal.`,
    details: {
      contract_id: row.id,
      pandadoc_document_id: documentId,
      revision: row.revision,
      subtotal,
      line_item_count: lineItems.length,
    },
  });

  const synced = await syncContractFromPandaDoc(row);
  return { ok: true, contract: mapContractRow(synced ?? row, null) };
}

function mapPandaDocStatus(raw: string): ContractStatus {
  switch (raw) {
    case "document.uploaded":
    case "document.draft":
      return "draft";
    case "document.waiting_approval":
      return "approval";
    case "document.viewed":
      return "viewed";
    case "document.completed":
    case "document.paid":
      return "completed";
    case "document.declined":
      return "declined";
    case "document.voided":
      return "voided";
    default:
      // sent, waiting_approval, approved, waiting_pay, external_review, ...
      return "sent";
  }
}

// Refreshes one contract from PandaDoc and runs the signed side effects the
// first time it comes back completed. Returns the updated row, or null when
// the contract has no PandaDoc document yet. Never throws on PandaDoc
// failures — the error lands on the row.
export async function syncContractFromPandaDoc(
  contract: ContractRow | string,
): Promise<ContractRow | null> {
  const row =
    typeof contract === "string" ? await getContractRow(contract) : contract;
  if (!row?.pandadoc_document_id) return row ?? null;

  let details = await getPandaDocDocumentDetails(row.pandadoc_document_id);
  if (!details.ok) {
    return updateContractRow(row.id, { last_error: details.error });
  }

  // Approval workflow: once someone approves in PandaDoc the document sits
  // in document.approved until it is sent again. Do that here so the
  // client can sign without the planner having to touch PandaDoc.
  if (details.data.status === "document.approved") {
    const sent = await sendPandaDocDocument(row.pandadoc_document_id, {
      subject: row.name,
      message: "Please review and sign the contract.",
      silent: true,
    });
    if (sent.ok) {
      await logIntegrationEvent({
        direction: "PORTAL_TO_PANDADOC",
        eventType: "contract_approved",
        portalEventId: row.event_id,
        status: "success",
        message:
          "Contract approved in PandaDoc; sent to the client for signature.",
        details: {
          contract_id: row.id,
          pandadoc_document_id: row.pandadoc_document_id,
        },
      });
      const reread = await getPandaDocDocumentDetails(row.pandadoc_document_id);
      if (reread.ok) details = reread;
    } else {
      await updateContractRow(row.id, { last_error: sent.error });
    }
  }

  const status = mapPandaDocStatus(details.data.status);
  const now = new Date().toISOString();
  const patch: ContractUpdate = {
    pandadoc_status: details.data.status,
    grand_total: details.data.grandTotal ?? toNumber(row.grand_total),
    last_error: null,
  };

  // Don't let a stale "sent" from PandaDoc regress a row that's already
  // further along (e.g. the webhook raced a page-load refresh).
  const finalStatuses: ContractStatus[] = ["completed", "declined", "voided"];
  if (!finalStatuses.includes(row.status) || finalStatuses.includes(status)) {
    patch.status = status;
  }
  if (status === "viewed" && !row.viewed_at) patch.viewed_at = now;
  if (status === "completed" && !row.completed_at) {
    patch.completed_at = details.data.dateCompleted ?? now;
  }
  if (
    ["approval", "sent", "viewed", "completed"].includes(status) &&
    !row.sent_at
  ) {
    patch.sent_at = now;
  }

  let updated = await updateContractRow(row.id, patch);

  if (updated.status === "completed" && !updated.signed_actions_applied_at) {
    updated = await applySignedContractActions(updated);
  }

  return updated;
}

// Page-load refresh for an event's open contracts (mirrors the GHL sync on
// the admin event page). Final-state rows are left alone.
export async function syncEventContracts(eventId: string): Promise<void> {
  if (!isPandaDocConfigured()) return;
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("event_id", eventId)
    .in("status", OPEN_CONTRACT_STATUSES)
    .not("pandadoc_document_id", "is", null);
  if (error) {
    console.error("Unable to load contracts for sync", error.message);
    return;
  }
  for (const row of (data ?? []) as ContractRow[]) {
    try {
      await syncContractFromPandaDoc(row);
    } catch (syncError) {
      console.error("Contract sync failed", row.id, syncError);
    }
  }
}

// Webhook entry point: PandaDoc tells us a document changed; re-read it
// from the API (authoritative) rather than trusting the payload's status.
export async function syncContractByDocumentId(
  documentId: string,
): Promise<ContractRow | null> {
  const row = await getContractRowByDocumentId(documentId);
  if (!row) return null;
  return syncContractFromPandaDoc(row);
}

// What "signed" sets in motion. Each step is independent and best-effort;
// the applied timestamp is written once regardless so nothing re-runs, and
// every outcome is in integration_logs for the admin to audit.
async function applySignedContractActions(
  row: ContractRow,
): Promise<ContractRow> {
  const supabase = createServiceRoleSupabaseClient();
  const { data: eventData } = await supabase
    .from("events")
    .select("*")
    .eq("id", row.event_id)
    .maybeSingle();
  const event = (eventData as EventRow | null) ?? null;

  const outcomes: Record<string, string> = {};

  // 1. Rooms: every held reservation on the event becomes booked.
  try {
    await setEventReservationsStatus({
      eventId: row.event_id,
      status: "booked",
    });
    outcomes.reservations = "booked";
  } catch (error) {
    outcomes.reservations = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  // 2. GHL: opportunity → Booked stage.
  if (event) {
    const moved = await moveOpportunityToBooked(event);
    outcomes.ghl_stage = moved.ok
      ? "booked"
      : moved.skipped
        ? `skipped: ${moved.error}`
        : `error: ${moved.error}`;
  } else {
    outcomes.ghl_stage = "skipped: event not found";
  }

  // 3. Archive the executed PDF in Supabase storage.
  let signedPdf: { bucket: string; path: string } | null = null;
  if (row.pandadoc_document_id) {
    const pdf = await downloadPandaDocDocument(row.pandadoc_document_id);
    if (pdf.ok) {
      const bucket = appConfig.supabase.storageBucket;
      const path = `contracts/${row.event_id}/${row.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, new Uint8Array(pdf.data), {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) {
        outcomes.signed_pdf = `error: ${uploadError.message}`;
      } else {
        signedPdf = { bucket, path };
        outcomes.signed_pdf = path;
      }
    } else {
      outcomes.signed_pdf = `error: ${pdf.error}`;
    }
  }

  const updated = await updateContractRow(row.id, {
    signed_actions_applied_at: new Date().toISOString(),
    ...(signedPdf
      ? { signed_pdf_bucket: signedPdf.bucket, signed_pdf_path: signedPdf.path }
      : {}),
  });

  const anyError = Object.values(outcomes).some((value) =>
    value.startsWith("error"),
  );
  await logIntegrationEvent({
    direction: "PANDADOC_TO_PORTAL",
    eventType: "contract_signed",
    ghlLocationId: event?.ghl_location_id ?? null,
    portalEventId: row.event_id,
    status: anyError ? "warning" : "success",
    message: anyError
      ? "Contract signed; some follow-up actions need attention."
      : "Contract signed: rooms booked, GHL opportunity moved to Booked, PDF archived.",
    details: {
      contract_id: row.id,
      pandadoc_document_id: row.pandadoc_document_id,
      ...outcomes,
    },
  });

  return updated;
}

// Planner-side refresh button.
export async function refreshEventContract(
  eventId: string,
  contractId: string,
): Promise<EventContract | null> {
  const row = await getContractRow(contractId);
  if (!row || row.event_id !== eventId) return null;
  const synced = await syncContractFromPandaDoc(row);
  return synced ? mapContractRow(synced, await signedPdfUrlFor(synced)) : null;
}

// Only contracts that never made it to PandaDoc can be removed; anything
// sent stays on the event as history.
export async function deleteFailedEventContract(
  eventId: string,
  contractId: string,
): Promise<void> {
  const row = await getContractRow(contractId);
  if (!row || row.event_id !== eventId) throw new Error("Contract not found.");
  if (
    !["draft", "creating", "error"].includes(row.status) &&
    row.pandadoc_document_id
  ) {
    throw new Error("Only contracts that failed to send can be removed.");
  }
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("event_contracts")
    .delete()
    .eq("id", contractId);
  if (error) throw new Error(`Unable to remove the contract: ${error.message}`);
}

// ---- Client portal ---------------------------------------------------------

export async function listClientContracts(
  eventId: string,
): Promise<ClientContract[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("event_id", eventId)
    .in("status", [
      "approval",
      "sent",
      "viewed",
      "completed",
      "declined",
      "voided",
    ])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load contracts: ${error.message}`);

  return ((data ?? []) as ContractRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    lineItems: parseContractLineItems(row.line_items),
    subtotal: toNumber(row.subtotal) ?? 0,
    grandTotal: toNumber(row.grand_total),
    status: row.status,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
    revisedAt: row.revised_at,
    canSign:
      SIGNABLE_CONTRACT_STATUSES.includes(row.status) &&
      Boolean(row.pandadoc_document_id),
  }));
}

export type ContractSigningSessionOutcome =
  | { ok: true; signingUrl: string; expiresAt: string | null }
  | { ok: false; error: string };

// Embedded-signing session for the portal's signer iframe. Re-checks
// PandaDoc first so a contract signed elsewhere doesn't offer signing again.
export async function createContractSigningSession(
  eventId: string,
  contractId: string,
): Promise<ContractSigningSessionOutcome> {
  const row = await getContractRow(contractId);
  if (!row || row.event_id !== eventId || !row.pandadoc_document_id) {
    return { ok: false, error: "Contract not found." };
  }
  if (!row.recipient_email) {
    return { ok: false, error: "This contract has no recipient email." };
  }

  const synced = (await syncContractFromPandaDoc(row)) ?? row;
  if (!SIGNABLE_CONTRACT_STATUSES.includes(synced.status)) {
    return {
      ok: false,
      error:
        synced.status === "completed"
          ? "This contract is already signed."
          : synced.status === "draft" || synced.status === "approval"
            ? "Your planner is finalizing this contract. Please check back a little later."
            : "This contract is no longer open for signing.",
    };
  }

  const session = await createPandaDocSigningSession(
    row.pandadoc_document_id,
    row.recipient_email,
  );
  if (!session.ok) return { ok: false, error: session.error };

  return {
    ok: true,
    signingUrl: pandaDocSigningUrl(session.data.sessionId),
    expiresAt: session.data.expiresAt,
  };
}

// Called by the portal when the embedded signer reports completion: pulls
// the final status immediately (so rooms flip within seconds) instead of
// waiting for a webhook or the next page load.
export async function completeContractSigningFromPortal(
  eventId: string,
  contractId: string,
): Promise<ClientContract | null> {
  const row = await getContractRow(contractId);
  if (!row || row.event_id !== eventId) return null;

  // PandaDoc can lag a beat behind the signer's completion event.
  let synced = await syncContractFromPandaDoc(row);
  for (
    let attempt = 0;
    attempt < 4 && synced && synced.status !== "completed";
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    synced = await syncContractFromPandaDoc(synced);
  }

  const contracts = await listClientContracts(eventId);
  return contracts.find((contract) => contract.id === contractId) ?? null;
}
