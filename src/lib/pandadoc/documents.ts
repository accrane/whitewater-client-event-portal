import {
  pandaDocDownload,
  pandaDocRequest,
  type PandaDocResult,
} from "@/lib/pandadoc/client";

// PandaDoc document operations behind the contracts feature: templates,
// document creation from a template (with the app's line items as a
// pricing table), silent send, embedded-signing sessions, status reads,
// and the signed PDF download.

export type PandaDocTemplateSummary = {
  id: string;
  name: string;
};

// The standard row columns the app fills, keyed by PandaDoc's column name.
export type PricingColumn = "Name" | "Description" | "Price" | "QTY";

export type PandaDocTemplatePricingTable = {
  name: string;
  // What the template reports; PandaDoc has rejected tables flagged true,
  // so treat it as a hint rather than a guarantee.
  dataMergeEnabled: boolean;
  // Menu-style tables ("choose one of the options below") hide Price/QTY;
  // a table whose price column shows is the one meant for line items.
  priceVisible: boolean;
  // Row data keys are each column's merge name, which someone can rename
  // in the template editor (one template has "Final Paymet" for Name).
  columnKeys: Record<PricingColumn, string>;
};

export type PandaDocTemplateDetails = {
  id: string;
  name: string;
  // Recipient roles defined on the template; the client is assigned to
  // the first one unless a role named like "client" exists.
  roles: string[];
  pricingTables: PandaDocTemplatePricingTable[];
  // Names of pricing tables in the template, in template order.
  pricingTableNames: string[];
  tokenNames: string[];
};

const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;
let templateListCache: {
  expiresAt: number;
  items: PandaDocTemplateSummary[];
} | null = null;

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

export async function getPandaDocTemplateDetails(
  templateId: string,
): Promise<PandaDocResult<PandaDocTemplateDetails>> {
  const result = await pandaDocRequest<{
    id?: string;
    name?: string;
    roles?: { name?: string }[];
    tokens?: { name?: string }[];
    pricing?: {
      tables?: {
        name?: string;
        data_merge_enabled?: boolean;
        columns?: {
          name?: string;
          merge_name?: string | null;
          hidden?: boolean;
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
    const column = (name: PricingColumn) =>
      columns.find((col) => col.name === name);
    const key = (name: PricingColumn) => column(name)?.merge_name || name;
    pricingTables.push({
      name: table.name,
      dataMergeEnabled: table.data_merge_enabled !== false,
      priceVisible: column("Price")?.hidden !== true,
      columnKeys: {
        Name: key("Name"),
        Description: key("Description"),
        Price: key("Price"),
        QTY: key("QTY"),
      },
    });
  }

  return {
    ok: true,
    data: {
      id: data.id ?? templateId,
      name: data.name ?? "Untitled template",
      roles: (data.roles ?? [])
        .map((role) => role.name)
        .filter((name): name is string => Boolean(name)),
      pricingTables,
      pricingTableNames: pricingTables.map((table) => table.name),
      tokenNames: (data.tokens ?? [])
        .map((token) => token.name)
        .filter((name): name is string => Boolean(name)),
    },
  };
}

// True when PandaDoc refused the request because the named pricing table
// can't be filled by API; callers try the template's next table.
export function isPricingTableRejection(error: string): boolean {
  return /data merge is disabled/i.test(error);
}

export type PandaDocPricingRow = {
  name: string;
  description: string;
  price: number;
  qty: number;
};

export type PandaDocPricingTableInput = {
  name: string;
  rows: PandaDocPricingRow[];
  // From the template's details; defaults to PandaDoc's standard names.
  columnKeys?: Record<PricingColumn, string>;
};

function pricingTablesPayload(table: PandaDocPricingTableInput | null) {
  if (!table) return {};
  const keys = table.columnKeys ?? {
    Name: "Name",
    Description: "Description",
    Price: "Price",
    QTY: "QTY",
  };
  return {
    pricing_tables: [
      {
        name: table.name,
        data_merge: true,
        options: { currency: "USD" },
        sections: [
          {
            title: "Event services",
            default: true,
            rows: table.rows.map((row) => ({
              options: { optional: false, qty_editable: false },
              data: {
                [keys.Name]: row.name,
                [keys.Description]: row.description,
                [keys.Price]: row.price,
                [keys.QTY]: row.qty,
              },
            })),
          },
        ],
      },
    ],
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
  pricingTable: PandaDocPricingTableInput | null;
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
    ...pricingTablesPayload(input.pricingTable),
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
  recipients: { email: string | null; hasCompleted: boolean }[];
};

export async function getPandaDocDocumentDetails(
  documentId: string,
): Promise<PandaDocResult<PandaDocDocumentDetails>> {
  const result = await pandaDocRequest<{
    id?: string;
    status?: string;
    date_completed?: string | null;
    grand_total?: { amount?: string | number; currency?: string } | null;
    recipients?: { email?: string; has_completed?: boolean }[];
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
  pricingTable: PandaDocPricingTableInput | null;
  metadata: Record<string, string>;
};

// Same shapes as create-from-template; the pricing table's single section
// is replaced with the app's current line items.
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
    ...pricingTablesPayload(input.pricingTable),
  };

  const result = await pandaDocRequest<unknown>(
    `/documents/${encodeURIComponent(documentId)}`,
    { method: "PATCH", body },
  );
  return result.ok ? { ok: true, data: undefined } : result;
}
