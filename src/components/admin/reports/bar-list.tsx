type BarListRow = {
  label: string;
  value: number;
  valueLabel: string;
  sublabel?: string;
};

type BarListProps = {
  rows: BarListRow[];
  emptyMessage: string;
};

// Horizontal magnitude list: every row directly labeled, single hue, track
// bars scaled to the largest value.
export function BarList({ rows, emptyMessage }: BarListProps) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-slate-800">
              {row.label}
            </p>
            <p className="text-sm font-semibold tabular-nums text-slate-950">
              {row.valueLabel}
            </p>
          </div>
          {row.sublabel ? (
            <p className="mt-0.5 text-xs text-slate-500">{row.sublabel}</p>
          ) : null}
          <div className="mt-1.5 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-[var(--chart-series)]"
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
