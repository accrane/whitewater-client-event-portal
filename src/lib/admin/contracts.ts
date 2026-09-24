import { setEventReservationsStatus } from "@/lib/admin/room-calendar";
import {
  getAdminEventById,
  mergeEventSnapshot,
  type AdminEventDetail,
  parseGhlSnapshot,
} from "@/lib/admin/events";
import { formatDisplayDate } from "@/lib/dates";
import { appConfig } from "@/lib/env";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import {
  moveOpportunityToBooked,
  writeOpportunityValue,
} from "@/lib/ghl/opportunity-sync";
import { resumeFollowUpsForEvent } from "@/lib/ghl/follow-up-pauses";
import { listPandaDocCatalogItems } from "@/lib/pandadoc/catalog";
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
  type PandaDocPricingTableInput,
  type PandaDocTemplateDetails,
  type PandaDocTemplateSummary,
} from "@/lib/pandadoc/documents";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import {
  EDITABLE_CONTRACT_STATUSES,
  OPEN_CONTRACT_STATUSES,
  SIGNABLE_CONTRACT_STATUSES,
  calculateContractSubtotal,
  failedSignedContractSteps,
  isCountedLineItem,
  parseContractLineItems,
  parseSignedContractSteps,
  signedContractStepsToRun,
  toNumber,
  type ClientContract,
  type ContractCatalogItem,
  type ContractLineItem,
  type ContractStatus,
  type ContractTemplateLayout,
  type EventContract,
  type SignedContractStep,
} from "@/lib/contracts/shared";
import type { Database, Json } from "@/types/database";

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
    customerViewUrl: row.pandadoc_shared_link,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    grandTotal: toNumber(row.grand_total),
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    completedAt: row.completed_at,
    signedActionsAppliedAt: row.signed_actions_applied_at,
    signedActionsPending: parseSignedContractSteps(row.signed_actions_pending),
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

export type ContractTemplateLayoutOutcome =
  | { ok: true; layout: ContractTemplateLayout }
  | { ok: false; error: string };

// The chosen template's pricing tables, for the contract form: one group
// per table under its visible heading, with the template's own rows (the
// options of a checkbox table, or starter rows like a cleaning fee).
export async function getContractTemplateLayout(
  templateId: string,
): Promise<ContractTemplateLayoutOutcome> {
  if (!isPandaDocConfigured()) {
    return { ok: false, error: "PandaDoc isn't connected yet." };
  }
  const template = await getPandaDocTemplateDetails(templateId);
  if (!template.ok) return { ok: false, error: template.error };

  return {
    ok: true,
    layout: {
      templateId: template.data.id,
      templateName: template.data.name,
      tables: template.data.pricingTables.map((table) => ({
        name: table.name,
        heading: table.heading,
        priced: table.priceVisible,
        rows: table.rows.map((row) => ({
          name: row.name,
          description: row.description,
          quantity: row.qty,
          unitPrice: row.price,
          table: table.name,
          tableHeading: table.heading,
          optional: row.optional,
          selected: row.selected,
        })),
      })),
    },
  };
}

export type ContractCatalogOutcome =
  | { ok: true; items: ContractCatalogItem[] }
  | { ok: false; error: string };

// The PandaDoc product catalog for the form's item picker.
export async function getContractCatalog(): Promise<ContractCatalogOutcome> {
  if (!isPandaDocConfigured()) {
    return { ok: false, error: "PandaDoc isn't connected yet." };
  }
  const catalog = await listPandaDocCatalogItems();
  return catalog.ok
    ? { ok: true, items: catalog.data }
    : { ok: false, error: catalog.error };
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
    "coordinator.name": text(event.coordinatorName),
    "coordinator.email": text(event.coordinatorEmail),
    "coordinator.phone": text(event.coordinatorPhone),
    // Templates built before planners were renamed coordinators use these.
    "planner.name": text(event.coordinatorName),
    "planner.email": text(event.coordinatorEmail),
    "planner.phone": text(event.coordinatorPhone),
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
  // True when the form showed the template's tables (starter rows
  // included), so what it submits is the whole picture: a priced table left
  // without rows is emptied rather than keeping the template's starter rows.
  templateTablesShown: boolean;
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
  const text = (value: string | null | undefined) => value?.trim() || null;
  return items
    .map((item) => {
      const optional = item.optional === true;
      return {
        name: item.name.trim(),
        description: item.description.trim(),
        quantity:
          Number.isFinite(item.quantity) && item.quantity > 0
            ? item.quantity
            : 1,
        unitPrice: Number.isFinite(item.unitPrice)
          ? Math.round(item.unitPrice * 100) / 100
          : 0,
        table: text(item.table),
        tableHeading: text(item.tableHeading),
        section: text(item.section),
        catalogItemId: text(item.catalogItemId),
        sku: text(item.sku),
        optional,
        selected: optional && item.selected === true,
      };
    })
    .filter((item) => item.name);
}

function toLineItemsJson(items: ContractLineItem[]) {
  return items.map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    table: item.table ?? null,
    table_heading: item.tableHeading ?? null,
    section: item.section ?? null,
    catalog_item_id: item.catalogItemId ?? null,
    sku: item.sku ?? null,
    optional: item.optional === true,
    selected: item.selected === true,
  }));
}

type PreparedLineItems =
  | { ok: true; lineItems: ContractLineItem[] }
  | { ok: false; error: string };

// Makes the submitted rows trustworthy before anything is saved or sent:
// every row lands in one of the template's tables (rows without one, or
// naming a table the template doesn't have, go in the first priced table),
// and catalog rows take their name, SKU and price from PandaDoc — the
// catalog is the price list, so whatever the browser sent is ignored.
async function prepareLineItems(
  template: PandaDocTemplateDetails,
  submitted: ContractLineItem[],
): Promise<PreparedLineItems> {
  const lineItems = normalizeLineItems(submitted);
  if (lineItems.length === 0) return { ok: true, lineItems };

  const tables = template.pricingTables;
  if (tables.length === 0) {
    return {
      ok: false,
      error: `The "${template.name}" template has no pricing table, so it can't carry line items. Pick another template or remove the items.`,
    };
  }
  const fallback = tables.find((table) => table.priceVisible) ?? tables[0];

  let catalog: Map<string, ContractCatalogItem> | null = null;
  if (lineItems.some((item) => item.catalogItemId)) {
    const result = await listPandaDocCatalogItems();
    if (!result.ok) {
      return {
        ok: false,
        error: `Couldn't read the PandaDoc catalog to confirm prices: ${result.error}`,
      };
    }
    catalog = new Map(result.data.map((entry) => [entry.id, entry]));
  }

  const prepared: ContractLineItem[] = [];
  for (const item of lineItems) {
    const table =
      tables.find((candidate) => candidate.name === item.table) ?? fallback;
    const row = { ...item, table: table.name, tableHeading: table.heading };

    if (item.catalogItemId) {
      const entry = catalog?.get(item.catalogItemId);
      if (!entry) {
        return {
          ok: false,
          error: `"${item.name}" is no longer in the PandaDoc catalog. Remove it, or add it as a custom row.`,
        };
      }
      row.name = entry.name;
      row.unitPrice = entry.price;
      row.sku = entry.sku;
    }
    prepared.push(row);
  }
  return { ok: true, lineItems: prepared };
}

// The line items as PandaDoc pricing tables: one entry per table that has
// rows, each split into sections by sub-heading, all in the order the
// coordinator arranged them. `clearTables` are tables whose existing rows
// (from the last save, or the template's starter rows) should go if no row
// is filed under them now; those are sent empty.
function buildPricingTables(
  lineItems: ContractLineItem[],
  clearTables: string[] = [],
): PandaDocPricingTableInput[] {
  const tables: PandaDocPricingTableInput[] = [];
  for (const item of lineItems) {
    if (!item.table) continue;
    let table = tables.find((candidate) => candidate.name === item.table);
    if (!table) {
      table = { name: item.table, sections: [] };
      tables.push(table);
    }
    const title = item.section ?? null;
    let section = table.sections.find((candidate) => candidate.title === title);
    if (!section) {
      section = { title, rows: [] };
      table.sections.push(section);
    }
    section.rows.push({
      name: item.name,
      description: item.description,
      price: item.unitPrice,
      qty: item.quantity,
      sku: item.sku ?? null,
      optional: item.optional === true,
      selected: item.selected === true,
    });
  }
  for (const name of clearTables) {
    if (!tables.some((table) => table.name === name)) {
      tables.push({ name, sections: [{ title: null, rows: [] }] });
    }
  }
  return tables;
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
// coordinator can see what happened and retry.
export async function createEventContract(
  input: CreateEventContractInput,
): Promise<CreateEventContractOutcome> {
  const event = await getAdminEventById(input.eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the contract a name." };

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

  // Template shape decides the recipient role and where line items go.
  // Read before anything is saved: an unreachable PandaDoc (or a catalog
  // item that no longer exists) is the coordinator's to fix in the form.
  if (!isPandaDocConfigured()) {
    return {
      ok: false,
      error: "PandaDoc isn't connected yet (PANDADOC_API_KEY is empty).",
    };
  }
  const template = await getPandaDocTemplateDetails(templateId);
  if (!template.ok) return { ok: false, error: template.error };
  const preparedItems = await prepareLineItems(template.data, input.lineItems);
  if (!preparedItems.ok) return { ok: false, error: preparedItems.error };
  const lineItems = preparedItems.lineItems;
  const subtotal = calculateContractSubtotal(lineItems);

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

  const recipient = { email: recipientEmail, ...splitName(recipientName) };
  const createInput = {
    name,
    templateId,
    recipient: { ...recipient, role: pickClientRole(template.data.roles) },
    tokens: buildContractTokens(
      event,
      { name, description: insert.description ?? null, subtotal },
      recipient,
    ),
    metadata: { portal_event_id: event.id, portal_contract_id: row.id },
  };
  const emptiedTables = input.templateTablesShown
    ? template.data.pricingTables
        .filter((table) => table.priceVisible && table.rows.length > 0)
        .map((table) => table.name)
    : [];
  const created = await createPandaDocDocument({
    ...createInput,
    pricingTables: buildPricingTables(lineItems, emptiedTables),
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
      line_item_count: lineItems.filter(isCountedLineItem).length,
    },
  });

  // Pull PandaDoc's computed total right away so the tab shows it.
  const synced = await syncContractFromPandaDoc(row);
  await syncEventValueFromContracts(event.id);
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
  // Nothing has changed in PandaDoc yet, so a problem here (a catalog item
  // that's gone, PandaDoc unreachable) leaves the sent contract as it was.
  if (!row.pandadoc_template_id) {
    return fail("This contract has no PandaDoc template on record, so its items can't be updated.");
  }
  const template = await getPandaDocTemplateDetails(row.pandadoc_template_id);
  if (!template.ok) return fail(template.error);
  const preparedItems = await prepareLineItems(template.data, input.lineItems);
  if (!preparedItems.ok) return fail(preparedItems.error);
  const lineItems = preparedItems.lineItems;
  const subtotal = calculateContractSubtotal(lineItems);

  // Tables that carried rows on the last save; any left without rows now
  // are sent empty so PandaDoc drops what it was holding.
  const previousTables = [
    ...new Set(
      parseContractLineItems(row.line_items)
        .map((item) => item.table)
        .filter((table): table is string => Boolean(table)),
    ),
  ].filter((name) =>
    template.data.pricingTables.some((table) => table.name === name),
  );

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

  const updateInput = {
    name,
    tokens: buildContractTokens(
      event,
      { name, description, subtotal },
      {
        email: row.recipient_email ?? "",
        ...splitName(row.recipient_name ?? ""),
      },
    ),
    metadata: { portal_event_id: event.id, portal_contract_id: row.id },
  };
  const updated = await updatePandaDocDocument(documentId, {
    ...updateInput,
    pricingTables: buildPricingTables(lineItems, previousTables),
  });
  if (!updated.ok) return fail(updated.error);

  // The app's record now matches what PandaDoc holds, even if the send
  // below fails and the coordinator has to retry.
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
      line_item_count: lineItems.filter(isCountedLineItem).length,
    },
  });

  const synced = await syncContractFromPandaDoc(row);
  await syncEventValueFromContracts(event.id);
  return { ok: true, contract: mapContractRow(synced ?? row, null) };
}

// Contracts that represent money on the table: everything with a live
// PandaDoc document that wasn't declined, voided, or never created.
const VALUE_CONTRACT_STATUSES: ContractStatus[] = [
  "draft",
  "approval",
  "sent",
  "viewed",
  "completed",
];

// The event's Value is the sum of its contracts (PandaDoc's total where
// known, else the app subtotal). Recomputed after every contract change and
// mirrored to the GHL opportunity's monetaryValue, which the event page
// reads back as authoritative. With no counted contracts the value is left
// alone so a manually entered figure survives until the first contract.
export async function syncEventValueFromContracts(
  eventId: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("status, subtotal, grand_total, pandadoc_document_id")
    .eq("event_id", eventId)
    .in("status", VALUE_CONTRACT_STATUSES)
    .not("pandadoc_document_id", "is", null);
  if (error) {
    console.error("Unable to total contracts for event value", error.message);
    return;
  }
  const rows = (data ?? []) as Pick<
    ContractRow,
    "status" | "subtotal" | "grand_total" | "pandadoc_document_id"
  >[];
  if (rows.length === 0) return;

  const total =
    Math.round(
      rows.reduce(
        (sum, row) =>
          sum + (toNumber(row.grand_total) ?? toNumber(row.subtotal) ?? 0),
        0,
      ) * 100,
    ) / 100;

  // Cheap when nothing moved: page-load syncs call this too, and a GHL
  // write per page view would be wasteful.
  const { data: current } = await supabase
    .from("events")
    .select("ghl_snapshot")
    .eq("id", eventId)
    .maybeSingle();
  const snapshot = (current as { ghl_snapshot?: Json } | null)?.ghl_snapshot;
  const existing =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? toNumber((snapshot as Record<string, Json | undefined>).value)
      : null;
  if (existing === total) return;

  const event = await mergeEventSnapshot(eventId, { value: total });
  await writeOpportunityValue(event, total);
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
    // waiting_pay = every recipient signed and PandaDoc is now collecting
    // the payment the template asks for. The signature is what books the
    // event, so it counts as signed here; payment status stays GHL's field.
    case "document.waiting_pay":
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
  // client can sign without the coordinator having to touch PandaDoc.
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
  // The customer's own PandaDoc link. PandaDoc only issues it once the
  // document is sent, and a re-send after an edit can change it.
  const recipientEmail = row.recipient_email?.toLowerCase();
  const recipient =
    details.data.recipients.find(
      (candidate) =>
        recipientEmail && candidate.email?.toLowerCase() === recipientEmail,
    ) ?? details.data.recipients.find((candidate) => candidate.sharedLink);

  const patch: ContractUpdate = {
    pandadoc_status: details.data.status,
    pandadoc_shared_link: recipient?.sharedLink ?? null,
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

  if (
    updated.status === "completed" &&
    signedStepsToRun(updated).length > 0
  ) {
    updated = await applySignedContractActions(updated);
  }

  // A changed total (PandaDoc recomputed) or a status leaving/entering the
  // counted set moves the event value.
  if (
    toNumber(updated.grand_total) !== toNumber(row.grand_total) ||
    VALUE_CONTRACT_STATUSES.includes(updated.status) !==
      VALUE_CONTRACT_STATUSES.includes(row.status)
  ) {
    await syncEventValueFromContracts(updated.event_id);
  }

  return updated;
}

// Page-load refresh for an event's open contracts (mirrors the GHL sync on
// the admin event page). Final-state rows are left alone.
// ---- All-contracts page ----------------------------------------------------

export type AdminContractListItem = {
  id: string;
  eventId: string;
  name: string;
  status: ContractStatus;
  pandadocStatus: string | null;
  pandadocDocumentId: string | null;
  recipientName: string | null;
  // PandaDoc's total when known, else the app subtotal.
  amount: number | null;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  lastError: string | null;
  event: {
    name: string;
    eventDate: string | null;
    eventType: string | null;
    coordinatorName: string | null;
    coordinatorEmail: string | null;
    coordinatorGhlUserId: string | null;
    numberOfGuests: number | null;
  };
};

// Every contract across every event, newest first, with the bits of the
// event the Contracts page filters and displays. Two queries rather than a
// join so the event snapshot goes through the same parser as everywhere.
export async function listAllContracts(): Promise<AdminContractListItem[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select(
      "id, event_id, name, status, pandadoc_status, pandadoc_document_id, recipient_name, subtotal, grand_total, created_at, sent_at, viewed_at, completed_at, updated_at, last_error",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load contracts: ${error.message}`);

  const rows = (data ?? []) as Pick<
    ContractRow,
    | "id"
    | "event_id"
    | "name"
    | "status"
    | "pandadoc_status"
    | "pandadoc_document_id"
    | "recipient_name"
    | "subtotal"
    | "grand_total"
    | "created_at"
    | "sent_at"
    | "viewed_at"
    | "completed_at"
    | "updated_at"
    | "last_error"
  >[];
  const eventIds = [...new Set(rows.map((row) => row.event_id))];
  const events = new Map<string, AdminContractListItem["event"]>();
  if (eventIds.length > 0) {
    const { data: eventRows, error: eventError } = await supabase
      .from("events")
      .select("id, ghl_snapshot")
      .in("id", eventIds);
    if (eventError) throw new Error(`Unable to load contract events: ${eventError.message}`);
    for (const row of (eventRows ?? []) as Pick<EventRow, "id" | "ghl_snapshot">[]) {
      const snapshot = parseGhlSnapshot(row.ghl_snapshot);
      events.set(row.id, {
        name: snapshot.eventName || "Untitled event",
        eventDate: snapshot.eventDate ?? null,
        eventType: snapshot.eventType ?? null,
        coordinatorName: snapshot.planner?.name ?? null,
        coordinatorEmail: snapshot.planner?.email ?? null,
        coordinatorGhlUserId: snapshot.planner?.id ?? null,
        numberOfGuests: snapshot.numberOfGuests ?? null,
      });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    status: row.status,
    pandadocStatus: row.pandadoc_status,
    pandadocDocumentId: row.pandadoc_document_id,
    recipientName: row.recipient_name,
    amount: toNumber(row.grand_total) ?? toNumber(row.subtotal),
    createdAt: row.created_at,
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    event: events.get(row.event_id) ?? {
      name: "Deleted event",
      eventDate: null,
      eventType: null,
      coordinatorName: null,
      coordinatorEmail: null,
      coordinatorGhlUserId: null,
      numberOfGuests: null,
    },
  }));
}

// Re-reads the stalest open contracts from PandaDoc (least recently
// updated first, up to `limit`) so the all-contracts page reflects
// approvals, views, and signatures made in PandaDoc. Events whose contract
// status changed get their value re-summed. Never throws.
export async function syncOpenContracts(limit: number): Promise<number> {
  if (!isPandaDocConfigured()) return 0;
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select("*")
    .in("status", OPEN_CONTRACT_STATUSES)
    .not("pandadoc_document_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("Unable to load contracts for sync", error.message);
    return 0;
  }
  const changedEvents = new Set<string>();
  let synced = 0;
  for (const row of (data ?? []) as ContractRow[]) {
    try {
      const after = await syncContractFromPandaDoc(row);
      synced += 1;
      if (after && after.status !== row.status) changedEvents.add(row.event_id);
    } catch (syncError) {
      console.error("Contract sync failed", row.id, syncError);
    }
  }
  for (const eventId of changedEvents) {
    try {
      await syncEventValueFromContracts(eventId);
    } catch (valueError) {
      console.error("Event value sync failed", eventId, valueError);
    }
  }
  await retryPendingSignedContracts({ limit: 10 });
  return synced;
}

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
  try {
    await syncEventValueFromContracts(eventId);
  } catch (valueError) {
    console.error("Event value sync failed", eventId, valueError);
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

// Copies the executed PDF from PandaDoc into Supabase storage. Called from
// the signed actions and again on later syncs when a signed contract has
// no archived PDF yet (a missing bucket or a PandaDoc hiccup shouldn't
// leave the event without its contract).
async function archiveSignedPdf(
  row: ContractRow,
): Promise<
  { ok: true; bucket: string; path: string } | { ok: false; error: string }
> {
  if (!row.pandadoc_document_id)
    return { ok: false, error: "No PandaDoc document" };
  const pdf = await downloadPandaDocDocument(row.pandadoc_document_id);
  if (!pdf.ok) return { ok: false, error: pdf.error };

  const supabase = createServiceRoleSupabaseClient();
  const bucket = appConfig.supabase.storageBucket;
  const path = `contracts/${row.event_id}/${row.id}.pdf`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, new Uint8Array(pdf.data), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error)
    return { ok: false, error: `${error.message} (bucket "${bucket}")` };
  return { ok: true, bucket, path };
}

function signedStepsToRun(row: ContractRow): SignedContractStep[] {
  return signedContractStepsToRun({
    signedActionsAppliedAt: row.signed_actions_applied_at,
    signedActionsPending: row.signed_actions_pending,
    signedPdfPath: row.signed_pdf_path,
  });
}

// What "signed" sets in motion. Each step is independent: one that fails (GHL
// down, PandaDoc slow) is recorded in signed_actions_pending and run again —
// on its own — by the next sync (the PandaDoc webhook, page views, Refresh),
// and the Contracts tab lists it as still to do. Finished steps never re-run,
// so rooms a coordinator changes after signing aren't touched again. Every
// attempt is in integration_logs.
async function applySignedContractActions(
  row: ContractRow,
): Promise<ContractRow> {
  const firstRun = !row.signed_actions_applied_at;
  const steps = signedStepsToRun(row);
  if (steps.length === 0) return row;

  // Claim the run so the webhook, the portal signer and a page-load sync
  // can't apply the same steps twice at once. The first run stamps
  // signed_actions_applied_at and marks every step pending, so a run that
  // dies midway leaves them all to retry; a retry claims by updated_at,
  // which every write to the row bumps.
  const supabase = createServiceRoleSupabaseClient();
  const claim = supabase
    .from("event_contracts")
    .update({
      signed_actions_applied_at:
        row.signed_actions_applied_at ?? new Date().toISOString(),
      signed_actions_pending: steps,
      signed_actions_attempts: (row.signed_actions_attempts ?? 0) + 1,
    } as never)
    .eq("id", row.id);
  const { data: claimed, error: claimError } = await (firstRun
    ? claim.is("signed_actions_applied_at", null)
    : claim.eq("updated_at", row.updated_at)
  )
    .select("*")
    .maybeSingle();
  if (claimError) {
    throw new Error(`Unable to start signed-contract steps: ${claimError.message}`);
  }
  if (!claimed) {
    // Another sync is already on it.
    return (await getContractRow(row.id)) ?? row;
  }

  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", row.event_id)
    .maybeSingle();
  const event = (eventData as EventRow | null) ?? null;
  // A failed lookup is worth another try; a deleted event isn't.
  const noEvent = eventError
    ? `error: couldn't load the event (${eventError.message})`
    : "skipped: event not found";

  const outcomes: Partial<Record<SignedContractStep, string>> = {};

  // 1. Rooms: every reservation on the event becomes booked.
  if (steps.includes("reservations")) {
    try {
      await setEventReservationsStatus({
        eventId: row.event_id,
        status: "booked",
      });
      outcomes.reservations = "booked";
    } catch (error) {
      outcomes.reservations = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // 2. GHL: opportunity → Booked stage.
  if (steps.includes("ghl_stage")) {
    if (event) {
      const moved = await moveOpportunityToBooked(event);
      outcomes.ghl_stage = moved.ok
        ? "booked"
        : moved.skipped
          ? `skipped: ${moved.error}`
          : `error: ${moved.error}`;
    } else {
      outcomes.ghl_stage = noEvent;
    }
  }

  // 3. A booked deal no longer needs its follow-ups paused.
  if (steps.includes("follow_ups")) {
    outcomes.follow_ups = event
      ? await resumeFollowUpsForEvent(event, "booked")
      : noEvent;
  }

  // 4. Archive the executed PDF in Supabase storage.
  let archived: Awaited<ReturnType<typeof archiveSignedPdf>> | null = null;
  if (steps.includes("signed_pdf")) {
    archived = await archiveSignedPdf(row);
    outcomes.signed_pdf = archived.ok
      ? archived.path
      : `error: ${archived.error}`;
  }

  const stillPending = failedSignedContractSteps(outcomes);
  const updated = await updateContractRow(row.id, {
    signed_actions_pending: stillPending,
    ...(archived?.ok
      ? { signed_pdf_bucket: archived.bucket, signed_pdf_path: archived.path }
      : {}),
  });

  await logIntegrationEvent({
    direction: "PANDADOC_TO_PORTAL",
    eventType: firstRun ? "contract_signed" : "contract_signed_retry",
    ghlLocationId: event?.ghl_location_id ?? null,
    portalEventId: row.event_id,
    status: stillPending.length > 0 ? "warning" : "success",
    message: firstRun
      ? stillPending.length > 0
        ? "Contract signed; some follow-up steps failed and will be retried automatically."
        : "Contract signed: rooms booked, GHL opportunity moved to Booked, PDF archived."
      : stillPending.length > 0
        ? "Retried the signed-contract steps that failed earlier; some still need another try."
        : "Signed-contract steps that failed earlier have now finished.",
    details: {
      contract_id: row.id,
      pandadoc_document_id: row.pandadoc_document_id,
      ...outcomes,
      still_pending: stillPending,
    },
  });

  return updated;
}

// Safety net for signed contracts whose follow-up steps haven't all run: a
// step that failed, or a run that never started (a webhook that errored just
// after saving the status). Completed contracts aren't in the open-status
// sweeps, so page loads call this too. Rows written in the last two minutes
// are left alone so an outage isn't retried on every page view, and a step
// that keeps failing (say, an opportunity deleted in GHL) stops retrying on
// its own after ten runs; the webhook and Refresh status still try. Never
// throws.
const SIGNED_STEP_RETRY_AFTER_MS = 2 * 60 * 1000;
const SIGNED_STEP_MAX_AUTO_ATTEMPTS = 10;

export async function retryPendingSignedContracts(options: {
  eventId?: string;
  limit: number;
}): Promise<number> {
  const supabase = createServiceRoleSupabaseClient();
  let query = supabase
    .from("event_contracts")
    .select("*")
    .eq("status", "completed")
    .or(
      "signed_actions_applied_at.is.null,signed_actions_pending.neq.{},signed_pdf_path.is.null",
    )
    .lt("signed_actions_attempts", SIGNED_STEP_MAX_AUTO_ATTEMPTS)
    .lt(
      "updated_at",
      new Date(Date.now() - SIGNED_STEP_RETRY_AFTER_MS).toISOString(),
    )
    .order("updated_at", { ascending: true })
    .limit(options.limit);
  if (options.eventId) query = query.eq("event_id", options.eventId);

  const { data, error } = await query;
  if (error) {
    console.error("Unable to load contracts with pending signed steps", error.message);
    return 0;
  }

  let retried = 0;
  for (const row of (data ?? []) as ContractRow[]) {
    try {
      await applySignedContractActions(row);
      retried += 1;
    } catch (retryError) {
      console.error("Signed-contract retry failed", row.id, retryError);
    }
  }
  return retried;
}

// Coordinator-side refresh button.
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
    // Options the coordinator left unticked aren't part of the client's order.
    lineItems: parseContractLineItems(row.line_items).filter(isCountedLineItem),
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
            ? "Your coordinator is finalizing this contract. Please check back a little later."
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
