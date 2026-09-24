import Link from "next/link";
import { after } from "next/server";

import { AdminShell } from "@/components/admin/admin-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import {
  contractStatusLabels,
  listAllContracts,
  syncOpenContracts,
  type AdminContractListItem,
} from "@/lib/admin/contracts";
import { resolveCurrentCoordinator } from "@/lib/admin/current-coordinator";
import {
  collectCoordinatorNames,
  CONTRACT_STATUS_GROUPS,
  contractStatusGroup,
  contractTab,
  isCurrentCoordinatorsEvent,
  matchesContractFilters,
  ME_COORDINATOR,
  parseContractListFilters,
  type ContractListFilters,
  type ContractListTab,
} from "@/lib/admin/event-filters";
import { getUserRole } from "@/lib/admin/users";
import { formatDisplayDate } from "@/lib/dates";
import { pandaDocDocumentUrl } from "@/lib/pandadoc/documents";
import { requireStaffUser } from "@/lib/admin/session";

// Every PandaDoc contract across every event, for the manager's approval
// pass and for coordinators keeping an eye on their own. Open contracts
// (nothing signed yet) and History (signed, declined, voided) are separate
// tabs; managers see all events, coordinators only their own.

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const statusTone: Record<string, BadgeTone> = {
  draft: "neutral",
  creating: "neutral",
  approval: "warning",
  sent: "neutral",
  viewed: "warning",
  completed: "success",
  declined: "danger",
  voided: "neutral",
  error: "danger",
};

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}

// One line under the badge saying when the last thing happened.
function statusDetail(contract: AdminContractListItem): string | null {
  switch (contract.status) {
    case "completed":
      return contract.completedAt ? `Signed ${shortDate(contract.completedAt)}` : null;
    case "viewed":
      return contract.viewedAt ? `Viewed ${shortDate(contract.viewedAt)}` : null;
    case "sent":
      return contract.sentAt ? `Sent ${shortDate(contract.sentAt)}` : null;
    case "approval":
      return "Waiting for a manager in PandaDoc";
    case "error":
      return contract.lastError ? contract.lastError.slice(0, 80) : null;
    default:
      return null;
  }
}

type AdminContractsPageProps = {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    coordinator?: string;
    status?: string;
    from?: string;
    to?: string;
    refresh?: string;
  }>;
};

export default async function AdminContractsPage({
  searchParams,
}: AdminContractsPageProps) {
  const { user } = await requireStaffUser();

  const params = await searchParams;
  const isAdmin = getUserRole(user) === "admin";
  const filters = parseContractListFilters(params);
  const refreshing = params.refresh === "1";

  // Statuses come from PandaDoc. "Refresh statuses" re-reads every open
  // contract before rendering; a normal load refreshes the stalest ones in
  // the background so the next visit is current.
  if (refreshing) {
    await syncOpenContracts(60);
  } else {
    after(async () => {
      await syncOpenContracts(25);
    });
  }

  const [all, me] = await Promise.all([
    listAllContracts(),
    resolveCurrentCoordinator(user.email),
  ]);

  // Coordinators are scoped to their own events before any filter applies;
  // the coordinator dropdown is a manager-only control.
  const scoped = isAdmin
    ? all
    : me
      ? all.filter((contract) => isCurrentCoordinatorsEvent(contract.event, me))
      : [];
  const effectiveFilters: ContractListFilters = isAdmin
    ? filters
    : { ...filters, coordinator: null };

  const rows = scoped
    .filter((contract) => matchesContractFilters(contract, effectiveFilters, me))
    .sort((a, b) => {
      if (filters.tab === "open") {
        // Approvals first: that's the manager's manual step.
        const aApproval = a.status === "approval" ? 0 : 1;
        const bApproval = b.status === "approval" ? 0 : 1;
        if (aApproval !== bApproval) return aApproval - bApproval;
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      return (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);
    });

  const tabCount = (tab: ContractListTab) =>
    scoped.filter((contract) => contractTab(contract.status) === tab).length;
  const approvalCount = scoped.filter((contract) => contract.status === "approval").length;
  const coordinatorNames = collectCoordinatorNames(scoped.map((contract) => contract.event));
  const filtering = Boolean(
    filters.q || effectiveFilters.coordinator || filters.status || filters.from || filters.to,
  );

  const hrefFor = (overrides: Partial<Record<string, string | null>>) => {
    const next = new URLSearchParams();
    const values: Record<string, string | null> = {
      tab: filters.tab === "history" ? "history" : null,
      q: filters.q || null,
      coordinator: effectiveFilters.coordinator,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/admin/contracts?${qs}` : "/admin/contracts";
  };

  return (
    <AdminShell
      actions={
        <ButtonLink href={hrefFor({ refresh: "1" })} variant="secondary">
          Refresh statuses
        </ButtonLink>
      }
      description={
        isAdmin
          ? "Every PandaDoc contract across every event. Contracts waiting for approval sit at the top of Open — open one in PandaDoc to approve it."
          : "PandaDoc contracts on your events, with where each one stands."
      }
      title="Contracts"
      userEmail={user.email}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Contract tabs"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          {(
            [
              { key: "open", label: "Open" },
              { key: "history", label: "History" },
            ] as const
          ).map((tab) => {
            const active = filters.tab === tab.key;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
                href={hrefFor({ tab: tab.key === "history" ? "history" : null, status: null })}
                key={tab.key}
              >
                {tab.label}
                <span className={active ? "ml-1.5 opacity-70" : "ml-1.5 text-slate-400"}>
                  {tabCount(tab.key)}
                </span>
              </Link>
            );
          })}
        </nav>
        {filters.tab === "open" && approvalCount > 0 ? (
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-900 transition hover:bg-amber-100"
            href={hrefFor({ status: "needs_approval" })}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {approvalCount} waiting for approval
          </Link>
        ) : null}
      </div>

      <form
        action="/admin/contracts"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
        method="get"
      >
        {filters.tab === "history" ? <input name="tab" type="hidden" value="history" /> : null}
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Search
          <input
            className={`${controlClass} w-56`}
            defaultValue={filters.q}
            name="q"
            placeholder="Contract, event, customer…"
            type="search"
          />
        </label>
        {isAdmin ? (
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Coordinator
            <select className={controlClass} defaultValue={filters.coordinator ?? ""} name="coordinator">
              <option value="">Any coordinator</option>
              {me ? <option value={ME_COORDINATOR}>My events</option> : null}
              <option value="unassigned">Unassigned</option>
              {coordinatorNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Status
          <select className={controlClass} defaultValue={filters.status ?? ""} name="status">
            <option value="">Any status</option>
            {CONTRACT_STATUS_GROUPS[filters.tab].map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Event date from
          <input className={controlClass} defaultValue={filters.from ?? ""} name="from" type="date" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Event date to
          <input className={controlClass} defaultValue={filters.to ?? ""} name="to" type="date" />
        </label>
        <button
          className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="submit"
        >
          Apply
        </button>
        {filtering ? (
          <Link
            className="self-center text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline"
            href={hrefFor({ q: null, coordinator: null, status: null, from: null, to: null })}
          >
            Clear filters
          </Link>
        ) : null}
      </form>

      {!isAdmin && !me ? (
        <EmptyState
          description="Your login has no email address to match against the coordinator on each event, so no contracts can be shown. Ask a manager to check your account."
          title="No coordinator match"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          description={
            filtering
              ? "No contracts match these filters."
              : filters.tab === "open"
                ? "Nothing is waiting on a signature or an approval."
                : "No signed, declined, or voided contracts yet."
          }
          title={filters.tab === "open" ? "No open contracts" : "No contract history"}
        />
      ) : (
        <ContractTable
          rows={rows}
          showValues={isAdmin}
          tab={filters.tab}
        />
      )}
    </AdminShell>
  );
}

const controlClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-800";

function ContractTable({
  rows,
  showValues,
  tab,
}: {
  rows: AdminContractListItem[];
  showValues: boolean;
  tab: ContractListTab;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 type-label text-slate-500">
              <th className="px-5 py-2">Contract</th>
              <th className="px-4 py-2">Event date</th>
              <th className="px-4 py-2">Coordinator</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Status</th>
              {showValues ? <th className="px-4 py-2 text-right">Amount</th> : null}
              <th className="px-5 py-2 text-right">PandaDoc</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((contract) => {
              const needsApproval = contract.status === "approval";
              const detail = statusDetail(contract);
              const group = contractStatusGroup(contract.status, contract.pandadocStatus);
              return (
                <tr
                  className={`border-b border-slate-100 last:border-b-0 ${
                    needsApproval ? "bg-amber-50/60" : ""
                  }`}
                  key={contract.id}
                >
                  <td className="px-5 py-3 align-top">
                    <p className="font-semibold text-slate-950">{contract.name}</p>
                    <Link
                      className="mt-0.5 block text-xs text-slate-500 underline-offset-2 hover:text-slate-950 hover:underline"
                      href={`/admin/events/${contract.eventId}/contracts`}
                    >
                      {contract.event.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-slate-700">
                    {contract.event.eventDate ? formatDisplayDate(contract.event.eventDate) : "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {contract.event.coordinatorName || (
                      <span className="text-slate-400">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {contract.recipientName || "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge tone={statusTone[contract.status] ?? "neutral"}>
                      {group === "unpaid" ? "Signed, unpaid" : contractStatusLabels[contract.status]}
                    </StatusBadge>
                    {detail ? (
                      <p className="mt-1 text-xs text-slate-500">{detail}</p>
                    ) : null}
                  </td>
                  {showValues ? (
                    <td className="px-4 py-3 text-right align-top whitespace-nowrap text-slate-700 tabular-nums">
                      {contract.amount !== null ? currency.format(contract.amount) : "—"}
                    </td>
                  ) : null}
                  <td className="px-5 py-3 text-right align-top whitespace-nowrap">
                    {contract.pandadocDocumentId ? (
                      <a
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          needsApproval
                            ? "bg-slate-950 text-white hover:bg-slate-800"
                            : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                        href={pandaDocDocumentUrl(contract.pandadocDocumentId)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {needsApproval ? "Approve in PandaDoc" : tab === "open" ? "Open in PandaDoc" : "View in PandaDoc"}
                        <Icon className="h-3.5 w-3.5">
                          <path d="M7 17 17 7" />
                          <path d="M8 7h9v9" />
                        </Icon>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Not in PandaDoc</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
