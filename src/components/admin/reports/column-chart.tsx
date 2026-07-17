import type { MonthlyPoint } from "@/lib/admin/reports";

type ColumnChartProps = {
  points: MonthlyPoint[];
  formatValue: (value: number) => string;
};

// Monthly column chart rendered with plain HTML/CSS: hairline gridlines,
// ≤24px bars with a 4px rounded cap, y-axis ticks on clean numbers, the peak
// month direct-labeled, and a CSS-only hover tooltip per column.
export function ColumnChart({ points, formatValue }: ColumnChartProps) {
  if (points.length === 0 || points.every((point) => point.value === 0)) {
    return (
      <p className="flex h-52 items-center justify-center text-sm text-slate-500">
        No data in this timeframe.
      </p>
    );
  }

  const max = niceCeiling(Math.max(...points.map((point) => point.value)));
  const peak = Math.max(...points.map((point) => point.value));
  const peakIndex = points.findIndex((point) => point.value === peak);

  return (
    <div className="flex gap-3">
      <div className="flex h-40 flex-col justify-between text-right text-[11px] tabular-nums text-slate-500">
        <span>{formatValue(max)}</span>
        <span>{formatValue(max / 2)}</span>
        <span>0</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative h-40">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <div className="h-px bg-slate-200" />
            <div className="h-px bg-slate-200" />
            <div className="h-px bg-slate-300" />
          </div>

          <div className="absolute inset-0 flex items-end gap-1">
            {points.map((point, index) => (
              <div
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                key={`${point.label}-${index}`}
              >
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md bg-slate-950 px-2.5 py-1.5 text-center whitespace-nowrap group-hover:block">
                  <p className="text-xs font-semibold text-white">
                    {formatValue(point.value)}
                  </p>
                  <p className="text-[11px] text-slate-300">
                    {point.label} · {point.detail}
                  </p>
                </div>

                {index === peakIndex && point.value > 0 ? (
                  <p className="mb-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 group-hover:invisible">
                    {formatValue(point.value)}
                  </p>
                ) : null}

                <div
                  className="w-full max-w-6 rounded-t bg-[var(--chart-series)] transition-colors group-hover:bg-[var(--chart-series-hover)]"
                  style={{
                    height: `${(point.value / max) * 100}%`,
                    minHeight: point.value > 0 ? "3px" : "0",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-1.5 flex gap-1">
          {points.map((point, index) => (
            <p
              className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-500"
              key={`${point.label}-${index}`}
            >
              {points.length > 14 && index % 2 === 1 ? "" : point.label}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// Rounds up to a clean axis maximum: 1 / 2 / 2.5 / 5 × 10^k.
function niceCeiling(value: number): number {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));

  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }

  return 10 * magnitude;
}
