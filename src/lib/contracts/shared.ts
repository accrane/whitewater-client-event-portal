import type { Database, Json } from "@/types/database";

// Pure contract types and helpers shared by server code and client
// components (the Contracts tab form, the portal signer). No Supabase or
// PandaDoc imports here — src/lib/admin/contracts.ts holds the server side.

export type ContractStatus =
  Database["public"]["Enums"]["event_contract_status"];

export type ContractLineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  // Which of the template's pricing tables the row goes in (PandaDoc's
  // internal table name) and that table's visible heading. Templates keep
  // one table per tax treatment — the Food & Beverage table adds the service
  // fee and tax — so the table decides how a row is taxed. Unset on
  // contracts made before rows were grouped; those go in the first priced
  // table.
  table?: string | null;
  tableHeading?: string | null;
  // Sub-heading the row sits under inside its table, e.g. the event day
  // ("Friday, November 20th - 9:45am arrival"). PandaDoc can't retitle a
  // table through the API, so the date line lives here.
  section?: string | null;
  // Set when the row came from the PandaDoc product catalog. PandaDoc owns
  // catalog names and prices; the server re-reads them on every save.
  catalogItemId?: string | null;
  sku?: string | null;
  // Checkbox rows ("Choose one of the options below"): every option is sent
  // and `selected` is the tick. Unticked options never count toward totals.
  optional?: boolean;
  selected?: boolean;
};

// An unticked option is on the document but isn't part of the order.
export function isCountedLineItem(item: ContractLineItem): boolean {
  return !item.optional || Boolean(item.selected);
}

// One product from the PandaDoc catalog, as the contract form lists it.
export type ContractCatalogItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  sku: string | null;
  category: string;
};

// A pricing table as the chosen template defines it. `priced` is false for
// menu-style tables that hide Price/QTY (the checkbox lists). `rows` are
// the template's own rows: options for a menu table, starter rows otherwise.
export type ContractTemplateTable = {
  name: string;
  heading: string;
  priced: boolean;
  rows: ContractLineItem[];
};

export type ContractTemplateLayout = {
  templateId: string;
  templateName: string;
  tables: ContractTemplateTable[];
};

// Catering categories are numbered ("3. Buffets") or named for food/drinks.
export function isFoodCatalogCategory(category: string): boolean {
  return /^\d+\.\s|catering|drinks/i.test(category);
}

export function isFoodTableHeading(heading: string): boolean {
  return /food|beverage|catering/i.test(heading);
}

export type EventContract = {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  lineItems: ContractLineItem[];
  subtotal: number;
  status: ContractStatus;
  pandadocDocumentId: string | null;
  pandadocTemplateId: string | null;
  pandadocStatus: string | null;
  pandadocUrl: string | null;
  /** The customer's public PandaDoc link (no login); null until sent. */
  customerViewUrl: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  grandTotal: number | null;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  signedActionsAppliedAt: string | null;
  // Short-lived download link for the archived signed PDF (admin only).
  signedPdfUrl: string | null;
  lastError: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // 1 for the original send; +1 each time it is edited and re-sent.
  revision: number;
  revisedAt: string | null;
  revisedBy: string | null;
};

// Statuses where PandaDoc can still change its mind; others are final.
export const OPEN_CONTRACT_STATUSES: ContractStatus[] = [
  "approval",
  "sent",
  "viewed",
];

// Statuses where the client can sign right now. "approval" is open but not
// signable: the template's approval workflow is holding it in PandaDoc.
export const SIGNABLE_CONTRACT_STATUSES: ContractStatus[] = ["sent", "viewed"];

// Statuses a coordinator can still edit (the PandaDoc document exists and no one
// has signed). "draft" covers a re-send that failed halfway.
export const EDITABLE_CONTRACT_STATUSES: ContractStatus[] = [
  "draft",
  "approval",
  "sent",
  "viewed",
];

export const contractStatusLabels: Record<ContractStatus, string> = {
  draft: "Draft",
  creating: "Creating in PandaDoc…",
  approval: "Awaiting PandaDoc approval",
  sent: "Awaiting signature",
  viewed: "Viewed by customer",
  completed: "Signed",
  declined: "Declined",
  voided: "Voided",
  error: "Failed",
};

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

export function parseContractLineItems(value: Json): ContractLineItem[] {
  if (!Array.isArray(value)) return [];
  const items: ContractLineItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    const optional = row.optional === true;
    items.push({
      name,
      description: typeof row.description === "string" ? row.description : "",
      quantity: toNumber(row.quantity) ?? 1,
      unitPrice: toNumber(row.unit_price ?? row.unitPrice) ?? 0,
      table: text(row.table),
      tableHeading: text(row.table_heading ?? row.tableHeading),
      section: text(row.section),
      catalogItemId: text(row.catalog_item_id ?? row.catalogItemId),
      sku: text(row.sku),
      optional,
      selected: optional && row.selected === true,
    });
  }
  return items;
}

// "12-31-2026 - Group name - Contact name": the name a new contract starts
// with. Any missing piece is left out so the name never carries a stray
// dash; the date is read from the yyyy-MM-dd string directly so it can't
// shift a day across time zones.
export function defaultContractName(input: {
  eventDate: string | null;
  eventName: string | null;
  contactName: string | null;
}): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.eventDate ?? "");
  return [
    date ? `${date[2]}-${date[3]}-${date[1]}` : null,
    input.eventName?.trim() || null,
    input.contactName?.trim() || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" - ");
}

export function calculateContractSubtotal(items: ContractLineItem[]): number {
  return (
    Math.round(
      items
        .filter(isCountedLineItem)
        .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100,
    ) / 100
  );
}

// Line items in document order, grouped table → section for display.
export type ContractLineItemGroup = {
  table: string | null;
  heading: string | null;
  sections: { title: string | null; items: ContractLineItem[] }[];
};

export function groupContractLineItems(
  items: ContractLineItem[],
): ContractLineItemGroup[] {
  const groups: ContractLineItemGroup[] = [];
  for (const item of items) {
    const table = item.table ?? null;
    let group = groups.find((candidate) => candidate.table === table);
    if (!group) {
      group = { table, heading: item.tableHeading ?? null, sections: [] };
      groups.push(group);
    }
    const title = item.section ?? null;
    let section = group.sections.find((candidate) => candidate.title === title);
    if (!section) {
      section = { title, items: [] };
      group.sections.push(section);
    }
    section.items.push(item);
  }
  return groups;
}

export type ClientContract = {
  id: string;
  name: string;
  description: string | null;
  lineItems: ContractLineItem[];
  subtotal: number;
  grandTotal: number | null;
  status: ContractStatus;
  sentAt: string | null;
  completedAt: string | null;
  // Set when the coordinator edited and re-sent it after the first send.
  revisedAt: string | null;
  // Signing is offered while PandaDoc is waiting on the client.
  canSign: boolean;
};
