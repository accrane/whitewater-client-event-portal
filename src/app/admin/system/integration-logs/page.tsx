import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { SystemNav } from "@/components/admin/system-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { listAdminIntegrationLogs } from "@/lib/admin/integration-logs";
import { requireAdminUser } from "@/lib/admin/users";

const directionLabels = {
  GHL_TO_PORTAL: "GHL → Portal",
  PORTAL_TO_GHL: "Portal → GHL",
} as const;

const statusLabels = {
  success: "Success",
  warning: "Warning",
  error: "Error",
} as const;

const statusClasses = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  error: "bg-rose-50 text-rose-700 ring-rose-600/20",
} as const;

export default async function AdminIntegrationLogsPage() {
  const { user } = await requireAdminUser();

  const logs = await listAdminIntegrationLogs();
  const successCount = logs.filter((log) => log.status === "success").length;
  const warningCount = logs.filter((log) => log.status === "warning").length;
  const errorCount = logs.filter((log) => log.status === "error").length;

  return (
    <AdminShell
      description="Read-only view of the latest GoHighLevel webhook and portal sync records captured in Supabase."
      eyebrow="Admin"
      title="Integration Logs"
      userEmail={user.email}
    >
      <SystemNav />

      <section className="grid gap-4 md:grid-cols-3">
        <AdminStatCard
          hint="Recent sync events completed successfully"
          label="Success"
          value={String(successCount)}
        />
        <AdminStatCard
          hint="Duplicate or attention-needed events"
          label="Warnings"
          value={String(warningCount)}
        />
        <AdminStatCard
          hint="Failed integration events in the latest logs"
          label="Errors"
          value={String(errorCount)}
        />
      </section>

      {logs.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-slate-950">
              Recent integration activity
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Showing the 50 most recent webhook and sync log records.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {logs.map((log) => (
              <article className="px-5 py-5 sm:px-6" key={log.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses[log.status]}`}
                  >
                    {statusLabels[log.status]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {directionLabels[log.direction]}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {log.eventType}
                  </span>
                </div>

                <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-950">
                      {log.message}
                    </h3>
                    {log.detailSummary ? (
                      <p className="mt-2 break-words text-sm text-slate-600">
                        {log.detailSummary}
                      </p>
                    ) : null}

                    <dl className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                      <LogMeta label="GHL event" value={log.ghlEventRecordId} />
                      <LogMeta label="GHL location" value={log.ghlLocationId} />
                      <LogMeta
                        label="Portal event"
                        value={
                          log.portalEventId ? (
                            <Link
                              className="font-semibold text-slate-950 underline-offset-4 hover:underline"
                              href={`/admin/events/${log.portalEventId}`}
                            >
                              {log.portalEventId}
                            </Link>
                          ) : null
                        }
                      />
                    </dl>
                  </div>

                  <p className="text-sm text-slate-500 lg:text-right">
                    {formatDateTime(log.createdAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          description="Integration log records will appear here after GHL webhook or portal sync activity is captured."
          title="No integration activity yet"
        />
      )}
    </AdminShell>
  );
}

type LogMetaProps = {
  label: string;
  value: React.ReactNode | string | null;
};

function LogMeta({ label, value }: LogMetaProps) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-mono text-xs text-slate-800">
        {value || "Not set"}
      </dd>
    </div>
  );
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
