"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  EventFilterFields,
  type CoordinatorOption,
} from "@/components/admin/event-filter-fields";
import {
  applyFiltersToParams,
  ME_COORDINATOR,
  type OpportunityFilters,
} from "@/lib/admin/event-filters";

// The dashboard's filter row. The page is server-rendered, so a change here
// rewrites the URL (debounced, keeping the contracts switch) and the server
// re-renders every section filtered.

function serialize(filters: OpportunityFilters, contractsMode: "window" | "all"): string {
  const params = new URLSearchParams();
  applyFiltersToParams(params, filters);
  if (contractsMode === "all") params.set("contracts", "all");
  return params.toString();
}

export function DashboardFilters({
  initialFilters,
  contractsMode,
  coordinatorNames,
  groupTypes,
  canFilterToMe,
}: {
  initialFilters: OpportunityFilters;
  contractsMode: "window" | "all";
  coordinatorNames: string[];
  groupTypes: string[];
  // False when the signed-in user has no coordinator identity to match on.
  canFilterToMe: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);

  const current = serialize(filters, contractsMode);
  const initial = serialize(initialFilters, contractsMode);

  useEffect(() => {
    if (current === initial) return;
    const timer = setTimeout(() => {
      router.replace(current ? `${pathname}?${current}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [current, initial, router, pathname]);

  const coordinatorOptions: CoordinatorOption[] = coordinatorNames.map((name) => ({
    value: name,
    label: name,
  }));

  return (
    <EventFilterFields
      coordinatorOptions={coordinatorOptions}
      filters={filters}
      groupTypes={groupTypes}
      leadingCoordinatorOptions={
        canFilterToMe ? [{ value: ME_COORDINATOR, label: "My events" }] : []
      }
      onChange={setFilters}
    />
  );
}
