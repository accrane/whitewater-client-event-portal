import type { Database, Json } from "@/types/database";

// Pure contract types and helpers shared by server code and client
// components (the Contracts tab form, the portal signer). No Supabase or
// PandaDoc imports here — src/lib/admin/contracts.ts holds the server side.

export type ContractStatus = Database["public"]["Enums"]["event_contract_status"];

export type ContractLineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

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
};

// Statuses where PandaDoc can still change its mind; others are final.
export const OPEN_CONTRACT_STATUSES: ContractStatus[] = ["sent", "viewed"];

export const contractStatusLabels: Record<ContractStatus, string> = {
  draft: "Draft",
  creating: "Creating in PandaDoc…",
  sent: "Awaiting signature",
  viewed: "Viewed by client",
  completed: "Signed",
  declined: "Declined",
  voided: "Voided",
  error: "Failed",
};

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
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
    items.push({
      name,
      description: typeof row.description === "string" ? row.description : "",
      quantity: toNumber(row.quantity) ?? 1,
      unitPrice: toNumber(row.unit_price ?? row.unitPrice) ?? 0,
    });
  }
  return items;
}

export function calculateContractSubtotal(items: ContractLineItem[]): number {
  return Math.round(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100,
  ) / 100;
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
  // Signing is offered while PandaDoc is waiting on the client.
  canSign: boolean;
};

