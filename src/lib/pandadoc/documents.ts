import {
  pandaDocDownload,
  pandaDocRequest,
  type PandaDocResult,
} from "@/lib/pandadoc/client";

// PandaDoc document operations behind the contracts feature: templates,
// document creation from a template (with the app's line items filed
// into its pricing tables), silent send, embedded-signing sessions, status reads,
// and the signed PDF download.

export type PandaDocTemplateSummary = {
  id: string;
  name: string;
};

export type PandaDocTemplateRow = {
  name: string;
  description: string;
  price: number;
  qty: number;
  // Checkbox rows ("optional" line items) and whether they start ticked.
  optional: boolean;
  selected: boolean;
};

export type PandaDocTemplatePricingTable = {
  // PandaDoc's internal name ("PricingTable1"). It is what the API addresses
  // a table by, but it says nothing about the table's purpose: the Food &
  // Beverage table has a different name in almost every template.
  name: string;
  // The visible heading (the Name column's title): "Item", "Food & Beverage
  // Items", "Rentals", "Choose One (1) of the Options Below:".
  heading: string;
  // Menu-style tables ("choose one of the options below") hide Price/QTY;
  // a table whose price column shows is one meant for line items.
  priceVisible: boolean;
  // Rows saved in the template: the options of a menu table, or starter
  // rows ("Cleaning Fee"). Blank placeholder rows are dropped.
  rows: PandaDocTemplateRow[];
};

export type PandaDocTemplateDetails = {
  id: string;
  name: string;
  // Recipient roles defined on the template; the client is assigned to
  // the first one unless a role named like "client" exists.
  roles: string[];
  pricingTables: PandaDocTemplatePricingTable[];
  tokenNames: string[];
};

const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;
let templateListCache: {
  expiresAt: number;
  items: PandaDocTemplateSummary[];
} | null = null;
const templateDetailsCache = new Map<
  string,
  { expiresAt: number; details: PandaDocTemplateDetails }
>();

export async function listPandaDocTemplates(
  options: { refresh?: boolean } = {},
): Promise<PandaDocResult<PandaDocTemplateSummary[]>> {
  if (
    !options.refresh &&
    templateListCache &&
    templateListCache.expiresAt > Date.now()
  ) {
    return { ok: true, data: templateListCache.items };
  }

  const result = await pandaDocRequest<{
    results?: { id?: string; name?: string }[];
  }>("/templates?count=100&page=1");

  if (!result.ok) return result;

  const items = (result.data.results ?? [])
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id as string,
      name: row.name ?? "Untitled template",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  templateListCache = { expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS, items };
  return { ok: true, data: items };
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? parsed
    : fallback;
}

// Cached like the template list: the form reads a template's tables when it
// is picked and the save reads them again moments later.
export async function getPandaDocTemplateDetails(
  templateId: string,
): Promise<PandaDocResult<PandaDocTemplateDetails>> {
  const cached = templateDetailsCache.get(templateId);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.details };
  }

  const result = await pandaDocRequest<{
    id?: string;
    name?: string;
    roles?: { name?: string }[];
    tokens?: { name?: string }[];
    pricing?: {
      tables?: {
        name?: string;
        columns?: {
          name?: string;
          header?: string | null;
          hidden?: boolean;
        }[];
        items?: {
          name?: string | null;
          description?: string | null;
          price?: string | number | null;
          qty?: string | number | null;
          options?: { optional?: boolean; optional_selected?: boolean };
        }[];
      }[];
    };
  }>(`/templates/${encodeURIComponent(templateId)}/details`);

  if (!result.ok) return result;

  const data = result.data;
  const pricingTables: PandaDocTemplatePricingTable[] = [];
  for (const table of data.pricing?.tables ?? []) {
    if (!table.name) continue;
    const columns = table.columns ?? [];
    const column = (name: string) => columns.find((col) => col.name === name);
    pricingTables.push({
      name: table.name,
      heading: column("Name")?.header?.trim() || table.name,
      priceVisible: column("Price")?.hidden !== true,
      rows: (table.items ?? [])
        // Templates keep an empty (sometimes zero-width-space) first row.
        .filter((item) => (item.name ?? "").replace(/[\s\u200b]/g, ""))
        .map((item) => ({
          name: (item.name ?? "").trim(),
          description: (item.description ?? "").trim(),
          price: finiteNumber(item.price, 0),
          qty: finiteNumber(item.qty, 1),
          optional: item.options?.optional === true,
          selected: item.options?.optional_selected === true,
        })),
    });
  }

  const details: PandaDocTemplateDetails = {
    id: data.id ?? templateId,
    name: data.name ?? "Untitled template",
    roles: (data.roles ?? [])
      .map((role) => role.name)
      .filter((name): name is string => Boolean(name)),
    pricingTables,
    tokenNames: (data.tokens ?? [])
      .map((token) => token.name)
      .filter((name): name is string => Boolean(name)),
  };
  templateDetailsCache.set(templateId, {
    expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS,
    details,
  });
  return { ok: true, data: details };
}

export type PandaDocPricingRow = {
  name: string;
  description: string;
  price: number;
  qty: number;
  sku?: string | null;
  // Checkbox row and its tick; plain rows leave both unset.
  optional?: boolean;
  selected?: boolean;
};

export type PandaDocPricingTableInput = {
  name: string;
  // A titled section prints its title as a sub-heading inside the table
  // (the event day); an untitled one prints rows only. Rows sent for a table
  // replace the rows saved in the template; a table that isn't sent keeps
  // them.
  sections: { title: string | null; rows: PandaDocPricingRow[] }[];
};

// Rows go in with PandaDoc's standard lowercase keys and data merge off.
// Data merge (custom column keys) is rejected by some tables even when the
// template reports it enabled, while the standard keys work on every table.
// Table-level tax, fees and discounts are the template's and are untouched,
// which is how the Food & Beverage service fee and tax get applied.
function pricingTablesPayload(tables: PandaDocPricingTableInput[]) {
  if (tables.length === 0) return {};
  return {
    pricing_tables: tables.map((table) => ({
      name: table.name,
      data_merge: false,
      options: { currency: "USD" },
      sections: table.sections.map((section, index) => ({
        title: section.title || `Section ${index + 1}`,
        default: !section.title,
        rows: section.rows.map((row) => ({
          options: {
            optional: row.optional === true,
            ...(row.optional ? { optional_selected: row.selected === true } : {}),
            qty_editable: false,
          },
          data: {
            name: row.name,
            description: row.description,
            price: row.price,
            qty: row.qty,
            ...(row.sku ? { sku: row.sku } : {}),
          },
        })),
      })),
    })),
  };
}

export type CreatePandaDocDocumentInput = {
  name: string;
  templateId: string;
  recipient: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  tokens: Record<string, string>;
  pricingTables: PandaDocPricingTableInput[];
  metadata: Record<string, string>;
};

// Creates the document (asynchronously on PandaDoc's side) and returns its
// id. It sits in document.uploaded until PandaDoc finishes processing;
// waitForPandaDocDraft handles that before sending.
export async function createPandaDocDocument(
  input: CreatePandaDocDocumentInput,
): Promise<PandaDocResult<{ id: string }>> {
  const body = {
    name: input.name,
    template_uuid: input.templateId,
    recipients: [
      {
        email: input.recipient.email,
        first_name: input.recipient.firstName,
        last_name: input.recipient.lastName,
        role: input.recipient.role,
      },
    ],
    tokens: Object.entries(input.tokens).map(([name, value]) => ({
      name,
      value,
    })),
    metadata: input.metadata,
    ...pricingTablesPayload(input.pricingTables),
  };

  const result = await pandaDocRequest<{ id?: string }>("/documents", {
    method: "POST",
    body,
  });

  if (!result.ok) return result;
  if (!result.data.id) {
    return { ok: false, error: "PandaDoc did not return a document id" };
  }
  return { ok: true, data: { id: result.data.id } };
}

export type PandaDocDocumentDetails = {
  id: string;
  status: string;
  dateCompleted: string | null;
  grandTotal: number | null;
  recipients: {
    email: string | null;
    hasCompleted: boolean;
    /** Public, no-login link PandaDoc issues this recipient once sent. */
    sharedLink: string | null;
  }[];
};

export async function getPandaDocDocumentDetails(
  documentId: string,
): Promise<PandaDocResult<PandaDocDocumentDetails>> {
  const result = await pandaDocRequest<{
    id?: string;
    status?: string;
    date_completed?: string | null;
    grand_total?: { amount?: string | number; currency?: string } | null;
    recipients?: {
      email?: string;
      has_completed?: boolean;
      shared_link?: string | null;
    }[];
  }>(`/documents/${encodeURIComponent(documentId)}/details`);

  if (!result.ok) return result;

  const data = result.data;
  const amount = data.grand_total?.amount;
  const grandTotal =
    typeof amount === "number"
      ? amount
      : typeof amount === "string" &&
          amount.trim() &&
          Number.isFinite(Number(amount))
        ? Number(amount)
        : null;

  return {
    ok: true,
    data: {
      id: data.id ?? documentId,
      status: data.status ?? "",
      dateCompleted: data.date_completed ?? null,
      grandTotal,
      recipients: (data.recipients ?? []).map((recipient) => ({
        email: recipient.email ?? null,
        hasCompleted: Boolean(recipient.has_completed),
        sharedLink: recipient.shared_link || null,
      })),
    },
  };
}

// Polls until the freshly created document leaves document.uploaded.
export async function waitForPandaDocDraft(
  documentId: string,
  attempts = 15,
): Promise<PandaDocResult<string>> {
  let lastStatus = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await pandaDocRequest<{ status?: string }>(
      `/documents/${encodeURIComponent(documentId)}`,
    );
    if (!result.ok) return result;
    lastStatus = result.data.status ?? "";
    if (lastStatus && lastStatus !== "document.uploaded") {
      return { ok: true, data: lastStatus };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return {
    ok: false,
    error: `PandaDoc is still processing the document (status ${lastStatus || "unknown"}). Refresh in a moment.`,
  };
}

// Moves the document to document.sent. silent=true skips PandaDoc's own
// email so the client signs from the portal instead.
export async function sendPandaDocDocument(
  documentId: string,
  options: { subject: string; message: string; silent: boolean },
): Promise<PandaDocResult<void>> {
  const result = await pandaDocRequest<unknown>(
    `/documents/${encodeURIComponent(documentId)}/send`,
    {
      method: "POST",
      body: {
        subject: options.subject,
        message: options.message,
        silent: options.silent,
      },
    },
  );
  return result.ok ? { ok: true, data: undefined } : result;
}

// Embedded-signing session for one recipient. The returned id is embedded
// as https://app.pandadoc.com/s/{id} inside the client portal.
export async function createPandaDocSigningSession(
  documentId: string,
  recipientEmail: string,
  lifetimeSeconds = 60 * 60,
): Promise<PandaDocResult<{ sessionId: string; expiresAt: string | null }>> {
  const result = await pandaDocRequest<{ id?: string; expires_at?: string }>(
    `/documents/${encodeURIComponent(documentId)}/session`,
    {
      method: "POST",
      body: { recipient: recipientEmail, lifetime: lifetimeSeconds },
    },
  );

  if (!result.ok) return result;
  if (!result.data.id) {
    return { ok: false, error: "PandaDoc did not return a signing session" };
  }
  return {
    ok: true,
    data: {
      sessionId: result.data.id,
      expiresAt: result.data.expires_at ?? null,
    },
  };
}

export function pandaDocSigningUrl(sessionId: string): string {
  return `https://app.pandadoc.com/s/${encodeURIComponent(sessionId)}`;
}

// Staff-facing link into the PandaDoc app for a document.
export function pandaDocDocumentUrl(documentId: string): string {
  return `https://app.pandadoc.com/a/#/documents/${encodeURIComponent(documentId)}`;
}

export async function downloadPandaDocDocument(
  documentId: string,
): Promise<PandaDocResult<ArrayBuffer>> {
  return pandaDocDownload(
    `/documents/${encodeURIComponent(documentId)}/download`,
  );
}

// ---- Editing an unsigned document -----------------------------------------
// PandaDoc only updates documents in document.draft. Editing a sent contract
// is therefore: move it back to draft (clears signature fields, nothing is
// emailed), update, then send again. Old signing sessions stop working.

export async function movePandaDocDocumentToDraft(
  documentId: string,
): Promise<PandaDocResult<{ status: string; version: string | null }>> {
  const result = await pandaDocRequest<{ status?: string; version?: string }>(
    `/documents/${encodeURIComponent(documentId)}/draft`,
    { method: "POST" },
  );
  if (!result.ok) {
    return result.status === 423
      ? {
          ok: false,
          status: 423,
          error:
            "PandaDoc has this document locked for editing (someone has it open in the PandaDoc app). Close it there and try again.",
        }
      : result;
  }
  return {
    ok: true,
    data: {
      status: result.data.status ?? "document.draft",
      version: result.data.version ?? null,
    },
  };
}

export type UpdatePandaDocDocumentInput = {
  name: string;
  tokens: Record<string, string>;
  pricingTables: PandaDocPricingTableInput[];
  metadata: Record<string, string>;
};

// Same shapes as create-from-template; each table sent has its rows
// replaced with the app's current line items.
export async function updatePandaDocDocument(
  documentId: string,
  input: UpdatePandaDocDocumentInput,
): Promise<PandaDocResult<void>> {
  const body = {
    name: input.name,
    tokens: Object.entries(input.tokens).map(([name, value]) => ({
      name,
      value,
    })),
    metadata: input.metadata,
    ...pricingTablesPayload(input.pricingTables),
  };

  const result = await pandaDocRequest<unknown>(
    `/documents/${encodeURIComponent(documentId)}`,
    { method: "PATCH", body },
  );
  return result.ok ? { ok: true, data: undefined } : result;
}
