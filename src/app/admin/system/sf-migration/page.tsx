import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { FlashBanner } from "@/components/admin/flash-banner";
import { SystemNav } from "@/components/admin/system-nav";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getLastSfPullRun,
  getSfMigrationStats,
  listSfContacts,
  type SfContactRow,
  type SfPushStatus,
} from "@/lib/admin/sf-migration";
import { requireAdminUser } from "@/lib/admin/users";
import { buildGhlContactPayload } from "@/lib/salesforce/ghl-mapping";

import {
  approveContactAction,
  excludeContactAction,
  pullContactsAction,
  restoreContactAction,
} from "./actions";

const statusLabels: Record<SfPushStatus, string> = {
  staged: "Staged",
  approved: "Approved",
  excluded: "Excluded",
  pushed: "Pushed",
  error: "Error",
};

const statusClasses: Record<SfPushStatus, string> = {
  staged: "bg-slate-100 text-slate-700 ring-slate-600/10",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  excluded: "bg-amber-50 text-amber-700 ring-amber-600/20",
  pushed: "bg-sky-50 text-sky-700 ring-sky-600/20",
  error: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

type SfMigrationPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    dupes?: string;
    page?: string;
    notice?: string;
    error?: string;
  }>;
};

function parseStatus(value: string | undefined): SfPushStatus | undefined {
  return value && value in statusLabels ? (value as SfPushStatus) : undefined;
}

export default async function SfMigrationPage({
  searchParams,
}: SfMigrationPageProps) {
  const { user } = await requireAdminUser();
  const params = await searchParams;

  const search = params.q?.trim() || undefined;
  const status = parseStatus(params.status);
  const dupesOnly = params.dupes === "1";
  const page = Math.max(1, Number(params.page) || 1);

  const [stats, lastRun, contactPage] = await Promise.all([
    getSfMigrationStats(),
    getLastSfPullRun(),
    listSfContacts({ search, status, dupesOnly, page }),
  ]);

  // Row-action redirects return to this exact filtered view.
  const returnParams = new URLSearchParams();
  if (search) returnParams.set("q", search);
  if (status) returnParams.set("status", status);
  if (dupesOnly) returnParams.set("dupes", "1");
  if (page > 1) returnParams.set("page", String(page));
  const returnParamsString = returnParams.toString();

  return (
    <AdminShell
      description="Salesforce contacts staged for the GoHighLevel migration. Review, exclude junk, approve, then push — nothing reaches GHL from this screen yet."
      eyebrow="Admin"
      title="Salesforce Migration"
      userEmail={user.email}
    >
      <SystemNav />

      {params.notice ? <FlashBanner>{params.notice}</FlashBanner> : null}

      {params.error ? <FlashBanner tone="error">{params.error}</FlashBanner> : null}

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <AdminStatCard
          hint="Contacts pulled from Salesforce"
          label="Staged total"
          value={stats.total.toLocaleString()}
        />
        <AdminStatCard
          hint="Awaiting review"
          label="Staged"
          value={stats.byStatus.staged.toLocaleString()}
        />
        <AdminStatCard
          hint="Ready for the next push"
          label="Approved"
          value={stats.byStatus.approved.toLocaleString()}
        />
        <AdminStatCard
          hint="Will not be migrated"
          label="Excluded"
          value={stats.byStatus.excluded.toLocaleString()}
        />
        <AdminStatCard
          hint="Contacts sharing an email with another contact"
          label="Duplicate emails"
          value={stats.duplicateContacts.toLocaleString()}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Salesforce pull
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {lastRun
                ? `Last run ${formatDateTime(lastRun.startedAt)} (${lastRun.mode}): ${lastRun.seen.toLocaleString()} checked, ${lastRun.upserted.toLocaleString()} added or updated.${lastRun.error ? ` Failed: ${lastRun.error}` : ""}`
                : "No pulls recorded yet."}
            </p>
          </div>
          <div className="flex gap-2">
            <form action={pullContactsAction}>
              <input name="returnParams" type="hidden" value={returnParamsString} />
              <button
                className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                type="submit"
              >
                Pull updates
              </button>
            </form>
            <form action={pullContactsAction}>
              <input name="mode" type="hidden" value="full" />
              <input name="returnParams" type="hidden" value={returnParamsString} />
              <button
                className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="submit"
              >
                Full re-pull
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4 sm:px-6"
          method="get"
        >
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Search
            <input
              className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={search ?? ""}
              name="q"
              placeholder="Name, email, company, owner…"
              type="search"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Status
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={status ?? ""}
              name="status"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              className="h-4 w-4 rounded border-slate-300"
              defaultChecked={dupesOnly}
              name="dupes"
              type="checkbox"
              value="1"
            />
            Duplicate emails only
          </label>
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="submit"
          >
            Filter
          </button>
          {search || status || dupesOnly ? (
            <Link
              className="pb-2 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline"
              href="/admin/system/sf-migration"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600 sm:px-6">
          {contactPage.totalMatching.toLocaleString()} matching contact
          {contactPage.totalMatching === 1 ? "" : "s"}
          {dupesOnly ? ", grouped by email" : ", most recently changed first"}
        </div>

        {contactPage.contacts.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {contactPage.contacts.map((contact) => (
              <ContactRow
                contact={contact}
                key={contact.sf_id}
                returnParams={returnParamsString}
              />
            ))}
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              description="No staged contacts match these filters. Try clearing the search or running a pull."
              title="Nothing to review here"
            />
          </div>
        )}

        {contactPage.pageCount > 1 ? (
          <Pagination
            dupesOnly={dupesOnly}
            page={contactPage.page}
            pageCount={contactPage.pageCount}
            search={search}
            status={status}
          />
        ) : null}
      </section>
    </AdminShell>
  );
}

function ContactRow({
  contact,
  returnParams,
}: {
  contact: SfContactRow;
  returnParams: string;
}) {
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    "(no name)";
  const payload = buildGhlContactPayload(contact);

  return (
    <details className="group px-5 py-4 sm:px-6">
      <summary className="grid cursor-pointer list-none gap-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950">{name}</p>
          <p className="truncate text-sm text-slate-600">
            {contact.account_name || "No company"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-800">
            {contact.email || "No email"}
          </p>
          <p className="truncate text-sm text-slate-600">
            {contact.phone || "No phone"}
          </p>
        </div>
        <div className="min-w-0 text-sm text-slate-600">
          <p className="truncate">{contact.owner_name || "No owner"}</p>
          <p className="truncate">
            {contact.sf_modified_at
              ? formatDate(contact.sf_modified_at)
              : "Unknown date"}
          </p>
        </div>
        <span
          className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset sm:justify-self-end ${statusClasses[contact.push_status]}`}
        >
          {statusLabels[contact.push_status]}
        </span>
      </summary>

      <div className="mt-4 grid gap-4 rounded-lg bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            GHL payload this contact would push
          </h3>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-800 ring-1 ring-slate-200">
            {JSON.stringify(payload, null, 2)}
          </pre>
          {contact.description ? (
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-500">
                Salesforce description:{" "}
              </span>
              {contact.description}
            </p>
          ) : null}
          {contact.excluded_reason ? (
            <p className="mt-2 text-sm text-amber-700">
              Excluded: {contact.excluded_reason}
            </p>
          ) : null}
          <p className="mt-2 font-mono text-xs text-slate-400">
            {contact.sf_id}
          </p>
        </div>

        {contact.push_status !== "pushed" ? (
          <div className="flex flex-row gap-2 self-start lg:flex-col">
            {contact.push_status !== "approved" ? (
              <RowAction
                action={approveContactAction}
                contact={contact}
                label="Approve"
                name={name}
                returnParams={returnParams}
                tone="primary"
              />
            ) : null}
            {contact.push_status !== "excluded" ? (
              <RowAction
                action={excludeContactAction}
                contact={contact}
                label="Exclude"
                name={name}
                returnParams={returnParams}
                tone="secondary"
              />
            ) : null}
            {contact.push_status !== "staged" ? (
              <RowAction
                action={restoreContactAction}
                contact={contact}
                label="Restore to staged"
                name={name}
                returnParams={returnParams}
                tone="secondary"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function RowAction({
  action,
  contact,
  label,
  name,
  returnParams,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  contact: SfContactRow;
  label: string;
  name: string;
  returnParams: string;
  tone: "primary" | "secondary";
}) {
  return (
    <form action={action}>
      <input name="sfId" type="hidden" value={contact.sf_id} />
      <input name="name" type="hidden" value={name} />
      <input name="returnParams" type="hidden" value={returnParams} />
      <button
        className={
          tone === "primary"
            ? "rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            : "rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        }
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

function Pagination({
  page,
  pageCount,
  search,
  status,
  dupesOnly,
}: {
  page: number;
  pageCount: number;
  search?: string;
  status?: string;
  dupesOnly: boolean;
}) {
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (dupesOnly) params.set("dupes", "1");
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/admin/system/sf-migration?${qs}` : "/admin/system/sf-migration";
  };

  return (
    <nav
      aria-label="Contact pages"
      className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:px-6"
    >
      {page > 1 ? (
        <Link
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          href={pageHref(page - 1)}
        >
          Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-slate-600">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Link
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          href={pageHref(page + 1)}
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(date),
  );
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
