import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

import { coordinatorScopeFilter, type CurrentCoordinator } from "./event-filters";

type EventStatus = Database["public"]["Enums"]["portal_event_status"];

export type AdminDashboardMetrics = {
  draftPortalCount: number;
  launchedPortalCount: number;
  upcomingLaunchedCount: number;
  integrationReviewCount: number;
  checklistReviewCount: number;
};

// The event tiles (draft, launched, upcoming) are portal-wide for managers
// and scoped to the coordinator's own events when one is given; the
// integration and checklist counts are always portal-wide.
export async function getAdminDashboardMetrics(
  coordinator: CurrentCoordinator | null = null,
): Promise<AdminDashboardMetrics> {
  const supabase = createServiceRoleSupabaseClient();
  const scope = coordinator ? coordinatorScopeFilter(coordinator) : null;
  let launchedEvents = supabase.from("events").select("ghl_snapshot").eq("status", "launched");
  if (scope) launchedEvents = launchedEvents.or(scope);

  const [
    draftResult,
    launchedResult,
    integrationReviewResult,
    launchedEventsResult,
    checklistReviewResult,
  ] = await Promise.all([
    countEventsByStatus("draft", scope),
    countEventsByStatus("launched", scope),
    supabase
      .from("integration_logs")
      .select("id", { count: "exact", head: true })
      .in("status", ["warning", "error"]),
    launchedEvents,
    supabase
      .from("event_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
  ]);

  if (draftResult.error) {
    throw new Error(
      `Unable to count draft portals: ${draftResult.error.message}`,
    );
  }

  if (launchedResult.error) {
    throw new Error(
      `Unable to count launched portals: ${launchedResult.error.message}`,
    );
  }

  if (integrationReviewResult.error) {
    throw new Error(
      `Unable to count integration review items: ${integrationReviewResult.error.message}`,
    );
  }

  if (launchedEventsResult.error) {
    throw new Error(
      `Unable to load launched event dates: ${launchedEventsResult.error.message}`,
    );
  }

  if (checklistReviewResult.error) {
    throw new Error(
      `Unable to count checklist review items: ${checklistReviewResult.error.message}`,
    );
  }

  return {
    draftPortalCount: draftResult.count ?? 0,
    launchedPortalCount: launchedResult.count ?? 0,
    upcomingLaunchedCount: countUpcomingLaunchedEvents(
      launchedEventsResult.data ?? [],
    ),
    integrationReviewCount: integrationReviewResult.count ?? 0,
    checklistReviewCount: checklistReviewResult.count ?? 0,
  };
}

function countEventsByStatus(status: EventStatus, scope: string | null) {
  const supabase = createServiceRoleSupabaseClient();

  const query = supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return scope ? query.or(scope) : query;
}

function countUpcomingLaunchedEvents(rows: { ghl_snapshot: Json }[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows.filter((row) => {
    const eventDate = getLastEventDay(row.ghl_snapshot);

    return eventDate ? eventDate >= today : false;
  }).length;
}

// A multi-day event counts as upcoming until its last day has passed.
function getLastEventDay(snapshot: Json): Date | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const raw = snapshot as Record<string, Json | undefined>;
  const value =
    typeof raw.eventEndDate === "string" &&
    typeof raw.eventDate === "string" &&
    raw.eventEndDate > raw.eventDate
      ? raw.eventEndDate
      : raw.eventDate;

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

// ---- Dashboard lists -------------------------------------------------------

export type DashboardVendorSubmission = {
  id: string;
  eventId: string;
  vendorType: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  submittedAt: string;
};

// Client-submitted vendors still waiting for a coordinator to review them,
// oldest first so nothing sits forgotten at the bottom.
export async function listVendorSubmissionsNeedingReview(): Promise<
  DashboardVendorSubmission[]
> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("vendors")
    .select(
      "id, event_id, vendor_type, company_name, contact_name, email, created_at",
    )
    .eq("metadata->>source", "client_portal")
    .eq("metadata->>status", "needs_review")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load vendor submissions: ${error.message}`);
  }

  return (
    (data ?? []) as {
      id: string;
      event_id: string;
      vendor_type: string | null;
      company_name: string | null;
      contact_name: string | null;
      email: string | null;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    vendorType: row.vendor_type,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    submittedAt: row.created_at,
  }));
}

export type DashboardContract = {
  id: string;
  eventId: string;
  name: string;
  status: Database["public"]["Enums"]["event_contract_status"];
  pandadocStatus: string | null;
  payByCheckAt: string | null;
  amount: number;
  completedAt: string | null;
};

type ContractListRow = {
  id: string;
  event_id: string;
  name: string;
  status: Database["public"]["Enums"]["event_contract_status"];
  pandadoc_status: string | null;
  pay_by_check_at: string | null;
  subtotal: number | string | null;
  grand_total: number | string | null;
  completed_at: string | null;
};

function mapContractListRow(row: ContractListRow): DashboardContract {
  const amount = Number(row.grand_total ?? row.subtotal ?? 0);
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    status: row.status,
    pandadocStatus: row.pandadoc_status,
    payByCheckAt: row.pay_by_check_at,
    amount: Number.isFinite(amount) ? amount : 0,
    completedAt: row.completed_at,
  };
}

const CONTRACT_LIST_COLUMNS =
  "id, event_id, name, status, pandadoc_status, pay_by_check_at, subtotal, grand_total, completed_at";

// Most recently signed contracts across every event.
export async function listRecentlySignedContracts(
  limit = 8,
): Promise<DashboardContract[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select(CONTRACT_LIST_COLUMNS)
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load signed contracts: ${error.message}`);
  }

  return ((data ?? []) as ContractListRow[]).map(mapContractListRow);
}

// Every contract on the given events (any status), for the contract
// deadline check on the dashboard.
export async function listContractsForEvents(
  eventIds: string[],
): Promise<Map<string, DashboardContract[]>> {
  const byEvent = new Map<string, DashboardContract[]>();
  if (eventIds.length === 0) return byEvent;

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("event_contracts")
    .select(CONTRACT_LIST_COLUMNS)
    .in("event_id", eventIds);

  if (error) {
    throw new Error(`Unable to load event contracts: ${error.message}`);
  }

  for (const row of (data ?? []) as ContractListRow[]) {
    const contract = mapContractListRow(row);
    byEvent.set(contract.eventId, [
      ...(byEvent.get(contract.eventId) ?? []),
      contract,
    ]);
  }
  return byEvent;
}

export type ContractDeadlineState =
  | "no_contract"
  | "awaiting_approval"
  | "awaiting_signature"
  | "unpaid"
  | "check_pending";

// Whitewater needs contracts signed and paid two weeks before the event.
// From three weeks out, an event whose contracts aren't signed shows on the
// dashboard; from two weeks out, one that is signed but not yet paid in
// PandaDoc does too. Expedited events can't meet that timeline by
// definition, so their rule is "signed and paid before the event day":
// unsigned inside three days, or unpaid inside one. A contract marked
// "Paying by check" is still unpaid until someone marks it paid in PandaDoc,
// but reads as a check on its way. Returns null when the event is in the
// clear.
export function contractDeadlineState(
  contracts: DashboardContract[],
  daysOut: number,
  expedited = false,
): ContractDeadlineState | null {
  if (expedited && daysOut > 3) return null;
  const live = contracts.filter(
    (contract) =>
      !["declined", "voided", "error", "creating"].includes(contract.status),
  );
  const signed = live.filter((contract) => contract.status === "completed");

  if (signed.length === 0) {
    if (live.length === 0) return "no_contract";
    return live.some((contract) => contract.status === "approval")
      ? "awaiting_approval"
      : "awaiting_signature";
  }

  // Signed all round; payment matters inside two weeks.
  const unsigned = live.filter((contract) => contract.status !== "completed");
  if (unsigned.length > 0) return "awaiting_signature";
  if (daysOut > (expedited ? 1 : 14)) return null;
  const unpaid = signed.filter(
    (contract) => contract.pandadocStatus === "document.waiting_pay",
  );
  if (unpaid.length === 0) return null;
  return unpaid.every((contract) => contract.payByCheckAt)
    ? "check_pending"
    : "unpaid";
}
