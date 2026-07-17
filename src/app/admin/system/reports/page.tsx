import Link from "next/link";
import {
  addDays,
  addMonths,
  addQuarters,
  addYears,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { BarList } from "@/components/admin/reports/bar-list";
import { ColumnChart } from "@/components/admin/reports/column-chart";
import { StatusMixBar } from "@/components/admin/reports/status-mix-bar";
import { SystemNav } from "@/components/admin/system-nav";
import { getAdminReportData, type ReportRange } from "@/lib/admin/reports";
import { requireAdminUser } from "@/lib/admin/users";

const presets = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

type PresetKey = (typeof presets)[number]["key"];

function presetRange(key: PresetKey, now: Date): ReportRange {
  switch (key) {
    case "month": {
      const start = startOfMonth(now);
      return { start, end: addMonths(start, 1) };
    }
    case "quarter": {
      const start = startOfQuarter(now);
      return { start, end: addQuarters(start, 1) };
    }
    case "year": {
      const start = startOfYear(now);
      return { start, end: addYears(start, 1) };
    }
    case "12m": {
      const end = addMonths(startOfMonth(now), 1);
      return { start: addMonths(end, -12), end };
    }
    default:
      return { start: null, end: null };
  }
}

// Custom range inputs arrive as YYYY-MM-DD; parse in local time to match how
// event dates render across the app.
function parseDateParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type AdminReportsPageProps = {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
};

export default async function AdminReportsPage({
  searchParams,
}: AdminReportsPageProps) {
  const { user } = await requireAdminUser();

  const { range: rangeParam, from, to } = await searchParams;
  const customFrom = parseDateParam(from);
  const customTo = parseDateParam(to);
  const isCustom = Boolean(customFrom || customTo);

  const activePreset: PresetKey = presets.some((p) => p.key === rangeParam)
    ? (rangeParam as PresetKey)
    : "year";
  const range: ReportRange = isCustom
    ? { start: customFrom, end: customTo ? addDays(customTo, 1) : null }
    : presetRange(activePreset, new Date());

  const data = await getAdminReportData(range);
  const showUndatedHint =
    data.undatedCount > 0 && (isCustom || activePreset !== "all");

  const { engagement } = data;
  const viewedPct =
    engagement.launchedCount > 0
      ? Math.round((engagement.viewedCount / engagement.launchedCount) * 100)
      : null;
  const checklistPct =
    engagement.checklistTotal > 0
      ? Math.round(
          (engagement.checklistCompleted / engagement.checklistTotal) * 100,
        )
      : null;

  return (
    <AdminShell
      description="Event volume, value, and guest counts across the portal, filtered by event date."
      eyebrow="Admin"
      title="Reports"
      userEmail={user.email}
    >
      <SystemNav />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Filter reports by timeframe"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
        >
          {presets.map((preset) => {
            const active = !isCustom && preset.key === activePreset;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
                href={
                  preset.key === "year"
                    ? "/admin/system/reports"
                    : `/admin/system/reports?range=${preset.key}`
                }
                key={preset.key}
              >
                {preset.label}
              </Link>
            );
          })}
        </nav>

        <form
          action="/admin/system/reports"
          className="flex flex-wrap items-center gap-2"
        >
          <label className="text-[13px] font-medium text-slate-600" htmlFor="from">
            Custom
          </label>
          <input
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm"
            defaultValue={from ?? ""}
            id="from"
            name="from"
            type="date"
          />
          <span className="text-[13px] text-slate-400">to</span>
          <input
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm"
            defaultValue={to ?? ""}
            name="to"
            type="date"
          />
          <button
            className="rounded-md bg-slate-950 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-slate-800"
            type="submit"
          >
            Apply
          </button>
        </form>
      </div>

      {showUndatedHint ? (
        <p className="text-xs text-slate-500">
          {data.undatedCount} event{data.undatedCount === 1 ? "" : "s"} without
          an event date {data.undatedCount === 1 ? "is" : "are"} excluded from
          date-filtered views — switch to All time to include them.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminStatCard
          hint="Events dated in this timeframe"
          label="Events"
          value={formatNumber(data.kpis.eventCount)}
        />
        <AdminStatCard
          hint="Sum of event value (GHL opportunity)"
          label="Total value"
          value={formatCurrency(data.kpis.totalValue)}
        />
        <AdminStatCard
          hint="Sum of expected guest counts"
          label="Total guests"
          value={formatNumber(data.kpis.totalGuests)}
        />
        <AdminStatCard
          hint="Across events with a value set"
          label="Avg value / event"
          value={
            data.kpis.avgValue === null ? "—" : formatCurrency(data.kpis.avgValue)
          }
        />
        <AdminStatCard
          hint="Across events with a guest count"
          label="Avg guests / event"
          value={
            data.kpis.avgGuests === null
              ? "—"
              : formatNumber(Math.round(data.kpis.avgGuests))
          }
        />
        <AdminStatCard
          hint="Total value ÷ total guests"
          label="Value per guest"
          value={
            data.kpis.valuePerGuest === null
              ? "—"
              : formatCurrency(data.kpis.valuePerGuest)
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReportPanel
          subtitle="Total event value by event month"
          title="Value by month"
        >
          <ColumnChart formatValue={formatCurrencyCompact} points={data.monthlyValue} />
        </ReportPanel>
        <ReportPanel
          subtitle="Expected guests by event month"
          title="Guests by month"
        >
          <ColumnChart formatValue={formatNumber} points={data.monthlyGuests} />
        </ReportPanel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReportPanel
          subtitle="Value, events, and guests per event type"
          title="By event type"
        >
          <BarList
            emptyMessage="No events in this timeframe."
            rows={data.byType.map((row) => ({
              label: row.label,
              value: row.value,
              valueLabel: formatCurrency(row.value),
              sublabel: `${row.count} event${row.count === 1 ? "" : "s"} · ${formatNumber(row.guests)} guests`,
            }))}
          />
        </ReportPanel>

        <div className="grid gap-4">
          <ReportPanel
            subtitle="Where events in this timeframe sit in the portal lifecycle"
            title="Portal status"
          >
            <StatusMixBar mix={data.statusMix} />
          </ReportPanel>
          <ReportPanel
            subtitle="Payment status synced from GHL"
            title="Payment status"
          >
            <BarList
              emptyMessage="No events in this timeframe."
              rows={data.paymentMix.map((row) => ({
                label: row.label,
                value: row.count,
                valueLabel: formatNumber(row.count),
              }))}
            />
          </ReportPanel>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReportPanel
          subtitle="Calendar reservations starting in this timeframe"
          title="Room reservations"
        >
          <BarList
            emptyMessage="No reservations in this timeframe."
            rows={data.roomBookings.map((row) => ({
              label: row.label,
              value: row.count,
              valueLabel: formatNumber(row.count),
              sublabel: `${row.bookedCount} booked · ${row.count - row.bookedCount} held`,
            }))}
          />
        </ReportPanel>

        <ReportPanel
          subtitle="How clients are using their launched portals"
          title="Portal engagement"
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <EngagementStat
              label="Launched portals"
              value={formatNumber(engagement.launchedCount)}
            />
            <EngagementStat
              hint={viewedPct === null ? undefined : `${viewedPct}% of launched`}
              label="Viewed by client"
              value={formatNumber(engagement.viewedCount)}
            />
            <EngagementStat
              label="Total portal views"
              value={formatNumber(engagement.totalViews)}
            />
            <EngagementStat
              hint={
                checklistPct === null
                  ? undefined
                  : `${engagement.checklistCompleted} of ${engagement.checklistTotal} items`
              }
              label="Checklist completion"
              value={checklistPct === null ? "—" : `${checklistPct}%`}
            />
          </dl>
        </ReportPanel>
      </section>
    </AdminShell>
  );
}

function ReportPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EngagementStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-tight text-slate-950">
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
