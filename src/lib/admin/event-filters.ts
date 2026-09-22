// Filters shared by the Opportunities pipeline board and the admin
// dashboard: coordinator, group size, event date, and group type. Pure
// functions with no runtime imports so tests can exercise the parsing and
// matching directly. The board applies them client-side because every open
// opportunity is already on the page; the dashboard applies them
// server-side to portal events.
//
// One file rather than two because the test runner imports these .ts
// modules directly and can't resolve an extension-less relative import.

export type OpportunityFilters = {
  // GHL user id of the assigned coordinator, or "unassigned".
  coordinator: string | null;
  // Group size bounds (Number of Guests), inclusive; either may be unset.
  minGuests: number | null;
  maxGuests: number | null;
  // Event date bounds, yyyy-MM-dd, inclusive.
  from: string | null;
  to: string | null;
  // Inquiry Type value as stored in GHL.
  type: string | null;
};

export type FilterableOpportunity = {
  coordinatorId: string | null;
  guestCount: number | null;
  eventDate: string | null;
  inquiryType: string | null;
};

export const UNASSIGNED_COORDINATOR = "unassigned";

export const EMPTY_FILTERS: OpportunityFilters = {
  coordinator: null,
  minGuests: null,
  maxGuests: null,
  from: null,
  to: null,
  type: null,
};

function parseDate(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// Whole, non-negative guest counts only; anything else is unset.
export function parseGuestCount(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

// Reads the filter query params; anything malformed is treated as unset so
// a stale or hand-edited URL never breaks the page.
export function parseOpportunityFilters(params: {
  coordinator?: string;
  min_guests?: string;
  max_guests?: string;
  from?: string;
  to?: string;
  type?: string;
}): OpportunityFilters {
  const type = params.type?.trim();
  return {
    coordinator: params.coordinator?.trim() || null,
    minGuests: parseGuestCount(params.min_guests),
    maxGuests: parseGuestCount(params.max_guests),
    from: parseDate(params.from),
    to: parseDate(params.to),
    type: type || null,
  };
}

export function hasActiveFilters(filters: OpportunityFilters): boolean {
  return countActiveFilters(filters) > 0;
}

export function countActiveFilters(filters: OpportunityFilters): number {
  return [
    filters.coordinator,
    filters.minGuests !== null || filters.maxGuests !== null,
    filters.from || filters.to,
    filters.type,
  ].filter(Boolean).length;
}

// Writes the active filters onto a URLSearchParams (skipping unset ones) so
// stage links and the URL bar carry them.
export function applyFiltersToParams(
  params: URLSearchParams,
  filters: OpportunityFilters,
): void {
  if (filters.coordinator) params.set("coordinator", filters.coordinator);
  if (filters.minGuests !== null) params.set("min_guests", String(filters.minGuests));
  if (filters.maxGuests !== null) params.set("max_guests", String(filters.maxGuests));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.type) params.set("type", filters.type);
}

export function matchesOpportunityFilters(
  opportunity: FilterableOpportunity,
  filters: OpportunityFilters,
): boolean {
  if (filters.coordinator) {
    if (filters.coordinator === UNASSIGNED_COORDINATOR) {
      if (opportunity.coordinatorId) return false;
    } else if (opportunity.coordinatorId !== filters.coordinator) {
      return false;
    }
  }

  if (filters.minGuests !== null || filters.maxGuests !== null) {
    // A card with no guest count can't match a size filter.
    if (opportunity.guestCount === null) return false;
    if (filters.minGuests !== null && opportunity.guestCount < filters.minGuests) return false;
    if (filters.maxGuests !== null && opportunity.guestCount > filters.maxGuests) return false;
  }

  if (filters.from || filters.to) {
    // Same rule as the Won tab: no recorded event date, no date match.
    if (!opportunity.eventDate) return false;
    if (filters.from && opportunity.eventDate < filters.from) return false;
    if (filters.to && opportunity.eventDate > filters.to) return false;
  }

  if (filters.type) {
    if ((opportunity.inquiryType ?? "").toLowerCase() !== filters.type.toLowerCase()) {
      return false;
    }
  }

  return true;
}

// Distinct Inquiry Type values across the pipeline, alphabetical, so the
// dropdown offers exactly what GHL holds rather than a hard-coded list.
export function collectGroupTypes(
  opportunities: { inquiryType: string | null }[],
): string[] {
  const seen = new Map<string, string>();
  for (const opportunity of opportunities) {
    const value = opportunity.inquiryType?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// ---- Dashboard ------------------------------------------------------------
//
// The same filters applied to portal events, plus a switch that widens the
// contracts "Needs attention" list from the three-week deadline window to
// every upcoming launched event.

export type DashboardFilters = OpportunityFilters & {
  // "window" = the deadline rules (three weeks out, two weeks for payment);
  // "all" = every upcoming launched event the rules would ever flag.
  contracts: "window" | "all";
};

// Coordinator option meaning "the signed-in user's events".
export const ME_COORDINATOR = "me";

export type FilterableEvent = {
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  coordinatorGhlUserId: string | null;
  numberOfGuests: number | null;
  eventDate: string | null;
  eventType: string | null;
};

// Who the signed-in user is as a coordinator: their login email plus, when
// a GHL user shares that email, that user's id and name. Events carry the
// coordinator in a snapshot written at assignment time, so any of the three
// may be the only thing that still matches.
export type CurrentCoordinator = {
  email: string | null;
  ghlUserId: string | null;
  name: string | null;
};

export function parseDashboardFilters(params: {
  coordinator?: string;
  min_guests?: string;
  max_guests?: string;
  from?: string;
  to?: string;
  type?: string;
  contracts?: string;
}): DashboardFilters {
  return {
    ...parseOpportunityFilters(params),
    contracts: params.contracts === "all" ? "all" : "window",
  };
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();
}

export function isCurrentCoordinatorsEvent(
  event: FilterableEvent,
  me: CurrentCoordinator,
): boolean {
  return (
    sameText(event.coordinatorEmail, me.email) ||
    (Boolean(me.ghlUserId) && event.coordinatorGhlUserId === me.ghlUserId) ||
    sameText(event.coordinatorName, me.name)
  );
}

// Coordinator values on the dashboard are names (what events store
// reliably), "unassigned", or "me". Everything else defers to the shared
// opportunity matcher.
export function matchesDashboardEvent(
  event: FilterableEvent,
  filters: OpportunityFilters,
  me: CurrentCoordinator | null,
): boolean {
  if (filters.coordinator === ME_COORDINATOR) {
    if (!me || !isCurrentCoordinatorsEvent(event, me)) return false;
  } else if (filters.coordinator === UNASSIGNED_COORDINATOR) {
    if (event.coordinatorName?.trim()) return false;
  } else if (filters.coordinator) {
    if (!sameText(event.coordinatorName, filters.coordinator)) return false;
  }

  return matchesOpportunityFilters(
    {
      coordinatorId: null,
      guestCount: event.numberOfGuests,
      eventDate: event.eventDate,
      inquiryType: event.eventType,
    },
    { ...filters, coordinator: null },
  );
}

// Distinct coordinator names across the events, alphabetical, for the
// dropdown. Case-insensitive so "sam" and "Sam" don't appear twice.
export function collectCoordinatorNames(
  events: { coordinatorName: string | null }[],
): string[] {
  const seen = new Map<string, string>();
  for (const event of events) {
    const name = event.coordinatorName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
