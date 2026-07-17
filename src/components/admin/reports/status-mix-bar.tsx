import type { Database } from "@/types/database";

type PortalEventStatus =
  Database["public"]["Enums"]["portal_event_status"];

type StatusMixBarProps = {
  mix: { status: PortalEventStatus; count: number }[];
};

const statusLabels: Record<PortalEventStatus, string> = {
  draft: "Draft",
  launched: "Launched",
  expired: "Expired",
  archived: "Archived",
};

// Portal statuses are lifecycle stages, so the segments use an ordered
// single-hue ramp (light → dark blue) rather than unrelated hues. The vars
// resolve per admin theme in globals.css.
const statusColors: Record<PortalEventStatus, string> = {
  draft: "var(--chart-ordinal-1)",
  launched: "var(--chart-ordinal-2)",
  expired: "var(--chart-ordinal-3)",
  archived: "var(--chart-ordinal-4)",
};

// One stacked horizontal bar for the portal-status mix, segments separated
// by a 2px surface gap, with a legend carrying the counts.
export function StatusMixBar({ mix }: StatusMixBarProps) {
  const total = mix.reduce((sum, entry) => sum + entry.count, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No events in this timeframe.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        {mix.map((entry) => (
          <div
            key={entry.status}
            style={{
              backgroundColor: statusColors[entry.status],
              width: `${(entry.count / total) * 100}%`,
            }}
            title={`${statusLabels[entry.status]}: ${entry.count}`}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {mix.map((entry) => (
          <li className="flex items-center gap-2" key={entry.status}>
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: statusColors[entry.status] }}
            />
            <span className="text-sm text-slate-600">
              {statusLabels[entry.status]}
            </span>
            <span className="text-sm font-semibold tabular-nums text-slate-950">
              {entry.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
