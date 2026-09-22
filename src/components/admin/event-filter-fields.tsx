"use client";

import type { ReactNode } from "react";

import {
  countActiveFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  parseGuestCount,
  UNASSIGNED_COORDINATOR,
  type OpportunityFilters,
} from "@/lib/admin/event-filters";

// The filter row shared by the Opportunities pipeline and the dashboard:
// coordinator, guest count bounds, event date bounds, and group type. The
// caller owns the state and decides what a coordinator value means (a GHL
// user id on the pipeline, a name on the dashboard); this only renders the
// controls and reports changes.

export type CoordinatorOption = { value: string; label: string };

const controlClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-800";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-500">
      {label}
      {children}
    </label>
  );
}

export function EventFilterFields({
  filters,
  onChange,
  coordinatorOptions,
  leadingCoordinatorOptions = [],
  groupTypes,
  trailing,
}: {
  filters: OpportunityFilters;
  onChange: (next: OpportunityFilters) => void;
  // Coordinators to list after "Unassigned".
  coordinatorOptions: CoordinatorOption[];
  // Options slotted between "Any coordinator" and "Unassigned" (the
  // dashboard's "Me").
  leadingCoordinatorOptions?: CoordinatorOption[];
  groupTypes: string[];
  // Extra controls at the end of the row, before the Clear button.
  trailing?: ReactNode;
}) {
  const set = <K extends keyof OpportunityFilters>(
    key: K,
    value: OpportunityFilters[K],
  ) => onChange({ ...filters, [key]: value });
  const activeCount = countActiveFilters(filters);
  const selectedTypeListed =
    !filters.type ||
    groupTypes.some((type) => type.toLowerCase() === filters.type?.toLowerCase());

  return (
    <div
      aria-label="Filter events"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
      role="group"
    >
      <Field label="Coordinator">
        <select
          className={controlClass}
          onChange={(event) => set("coordinator", event.target.value || null)}
          value={filters.coordinator ?? ""}
        >
          <option value="">Any coordinator</option>
          {leadingCoordinatorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={UNASSIGNED_COORDINATOR}>Unassigned</option>
          {coordinatorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Guests from">
        <input
          className={`${controlClass} w-24`}
          inputMode="numeric"
          min={0}
          onChange={(event) => set("minGuests", parseGuestCount(event.target.value))}
          placeholder="Min"
          type="number"
          value={filters.minGuests ?? ""}
        />
      </Field>
      <Field label="Guests to">
        <input
          className={`${controlClass} w-24`}
          inputMode="numeric"
          min={0}
          onChange={(event) => set("maxGuests", parseGuestCount(event.target.value))}
          placeholder="Max"
          type="number"
          value={filters.maxGuests ?? ""}
        />
      </Field>
      <Field label="Event date from">
        <input
          className={controlClass}
          onChange={(event) => set("from", event.target.value || null)}
          type="date"
          value={filters.from ?? ""}
        />
      </Field>
      <Field label="Event date to">
        <input
          className={controlClass}
          onChange={(event) => set("to", event.target.value || null)}
          type="date"
          value={filters.to ?? ""}
        />
      </Field>
      <Field label="Group type">
        <select
          className={controlClass}
          onChange={(event) => set("type", event.target.value || null)}
          value={filters.type ?? ""}
        >
          <option value="">Any type</option>
          {groupTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
          {/* A type from the URL that nothing on the page carries still
              shows as selected rather than silently resetting. */}
          {!selectedTypeListed && filters.type ? (
            <option value={filters.type}>{filters.type}</option>
          ) : null}
        </select>
      </Field>
      {trailing}
      {hasActiveFilters(filters) ? (
        <button
          className="ml-auto inline-flex items-center gap-1.5 self-center rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          onClick={() => onChange(EMPTY_FILTERS)}
          type="button"
        >
          <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
          Clear {activeCount === 1 ? "filter" : `${activeCount} filters`}
        </button>
      ) : null}
    </div>
  );
}
