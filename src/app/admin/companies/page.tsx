import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  COMPANY_SORTS,
  defaultSortDir,
  listCompanies,
  listCompanyTypes,
  type CompanyDirectoryRow,
  type CompanySort,
  type CompanySortDir,
} from "@/lib/admin/companies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Companies directory: the app's permanent archive of booking history,
// seeded from Salesforce (docs/ecosystem-manual.md §4). Stats are computed
// live from staged opportunities, replacing the Salesforce roll-up fields
// that GHL has no equivalent for.

const sortLabels: Record<CompanySort, string> = {
  recent: "Last event",
  name: "Company name",
  type: "Type",
  bookings: "Events booked",
  contacts: "Contacts",
  upcoming: "Upcoming",
  next: "Next event",
};

function parseSort(value: string | undefined): CompanySort {
  return COMPANY_SORTS.includes(value as CompanySort)
    ? (value as CompanySort)
    : "recent";
}

function parseDir(value: string | undefined): CompanySortDir | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

// Query string for the current filters with a given sort/dir/page — shared
// by the sortable column headers and pagination so every link keeps the
// user's search context.
function buildListHref({
  search,
  type,
  bookedOnly,
  sort,
  dir,
  page,
}: {
  search?: string;
  type?: string;
  bookedOnly: boolean;
  sort: CompanySort;
  dir?: CompanySortDir;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (type) params.set("type", type);
  if (bookedOnly) params.set("booked", "1");
  if (sort !== "recent") params.set("sort", sort);
  if (dir) params.set("dir", dir);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/companies?${qs}` : "/admin/companies";
}

type CompaniesPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    booked?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

export default async function CompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const search = params.q?.trim() || undefined;
  const type = params.type || undefined;
  const bookedOnly = params.booked === "1";
  const sort = parseSort(params.sort);
  const dir = parseDir(params.dir);
  const page = Math.max(1, Number(params.page) || 1);

  const [companyPage, types] = await Promise.all([
    listCompanies({ search, type, bookedOnly, sort, dir, page }),
    listCompanyTypes(),
  ]);

  return (
    <AdminShell
      description="Every company from the Salesforce archive with its contacts and booking history. Booking stats are computed live from the opportunity history — this directory outlives the Salesforce cutover."
      title="Companies"
      userEmail={user.email}
    >
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
              placeholder="Company name…"
              type="search"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Type
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={type ?? ""}
              name="type"
            >
              <option value="">All types</option>
              {types.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Sort by
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={sort}
              name="sort"
            >
              {COMPANY_SORTS.map((value) => (
                <option key={value} value={value}>
                  {sortLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              className="h-4 w-4 rounded border-slate-300"
              defaultChecked={bookedOnly}
              name="booked"
              type="checkbox"
              value="1"
            />
            Booked business only
          </label>
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="submit"
          >
            Filter
          </button>
          {search || type || bookedOnly || sort !== "recent" || dir ? (
            <Link
              className="pb-2 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline"
              href="/admin/companies"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600 sm:px-6">
          {companyPage.totalMatching.toLocaleString()} compan
          {companyPage.totalMatching === 1 ? "y" : "ies"}
        </div>

        {companyPage.companies.length > 0 ? (
          <>
            {/* Column headers (desktop) */}
            <div className="hidden border-b border-slate-200 px-5 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(5,minmax(0,1fr))] sm:gap-4 sm:px-6">
              {(
                [
                  { key: "name", label: "Company", align: "left" },
                  { key: "type", label: "Type", align: "left" },
                  { key: "contacts", label: "Contacts", align: "right" },
                  { key: "bookings", label: "Events booked", align: "right" },
                  { key: "upcoming", label: "Upcoming", align: "right" },
                  { key: "recent", label: "Last event", align: "right" },
                  { key: "next", label: "Next event", align: "right" },
                ] as const
              ).map((column) => (
                <SortableHeader
                  align={column.align}
                  currentDir={dir}
                  currentSort={sort}
                  filters={{ search, type, bookedOnly }}
                  key={column.key}
                  label={column.label}
                  sortKey={column.key}
                />
              ))}
            </div>
            <ul className="divide-y divide-slate-200">
              {companyPage.companies.map((company) => (
                <CompanyRow company={company} key={company.sf_id} />
              ))}
            </ul>
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              description="No companies match these filters. Try clearing the search, or run a Salesforce pull from Admin → SF Migration."
              title="No companies found"
            />
          </div>
        )}

        {companyPage.pageCount > 1 ? (
          <Pagination
            bookedOnly={bookedOnly}
            dir={dir}
            page={companyPage.page}
            pageCount={companyPage.pageCount}
            search={search}
            sort={sort}
            type={type}
          />
        ) : null}
      </section>
    </AdminShell>
  );
}

function CompanyRow({ company }: { company: CompanyDirectoryRow }) {
  return (
    <li>
      <Link
        className="grid gap-1 px-5 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(5,minmax(0,1fr))] sm:items-center sm:gap-4 sm:px-6"
        href={`/admin/companies/${company.sf_id}`}
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
            <span className="truncate">{company.name || "(unnamed)"}</span>
            {company.has_name_dupes ? (
              <StatusBadge tone="warning">Possible duplicate</StatusBadge>
            ) : null}
          </p>
          <p className="truncate text-sm text-slate-600">
            {[company.billing_city, company.billing_state]
              .filter(Boolean)
              .join(", ") || "No location"}
          </p>
        </div>
        <p className="min-w-0 text-sm text-slate-700">
          {company.type ? (
            <StatusBadge tone="neutral">{company.type}</StatusBadge>
          ) : (
            "—"
          )}
        </p>
        <p className="text-sm text-slate-700 sm:text-right">
          <span className="sm:hidden">Contacts: </span>
          {company.contact_count.toLocaleString()}
        </p>
        <p className="text-sm text-slate-700 sm:text-right">
          <span className="sm:hidden">Events booked: </span>
          {company.won_count.toLocaleString()}
        </p>
        <p className="text-sm text-slate-700 sm:text-right">
          <span className="sm:hidden">Upcoming: </span>
          {company.upcoming_booked_count.toLocaleString()}
        </p>
        <p className="text-sm text-slate-700 sm:text-right">
          <span className="sm:hidden">Last event: </span>
          {company.last_event_date ? formatDate(company.last_event_date) : "—"}
        </p>
        <p className="text-sm sm:text-right">
          <span className="text-slate-700 sm:hidden">Next event: </span>
          {company.next_event_date ? (
            <span className="font-medium text-emerald-700">
              {formatDate(company.next_event_date)}
            </span>
          ) : (
            <span className="text-slate-700">—</span>
          )}
        </p>
      </Link>
    </li>
  );
}

// Clickable column header: clicking a new column sorts by it (each column's
// natural default direction), clicking the active column flips direction.
function SortableHeader({
  label,
  sortKey,
  align,
  currentSort,
  currentDir,
  filters,
}: {
  label: string;
  sortKey: CompanySort;
  align: "left" | "right";
  currentSort: CompanySort;
  currentDir?: CompanySortDir;
  filters: { search?: string; type?: string; bookedOnly: boolean };
}) {
  const isActive = currentSort === sortKey;
  const effectiveDir = currentDir ?? defaultSortDir(currentSort);
  const nextDir = isActive
    ? effectiveDir === "asc"
      ? ("desc" as const)
      : ("asc" as const)
    : undefined;

  return (
    <Link
      className={`inline-flex items-center gap-1 uppercase underline-offset-4 hover:text-slate-800 hover:underline ${
        align === "right" ? "justify-end text-right" : ""
      } ${isActive ? "text-slate-800" : ""}`}
      href={buildListHref({ ...filters, sort: sortKey, dir: nextDir })}
    >
      {label}
      {isActive ? (
        <span aria-hidden>{effectiveDir === "asc" ? "▲" : "▼"}</span>
      ) : null}
    </Link>
  );
}

function Pagination({
  page,
  pageCount,
  search,
  type,
  bookedOnly,
  sort,
  dir,
}: {
  page: number;
  pageCount: number;
  search?: string;
  type?: string;
  bookedOnly: boolean;
  sort: CompanySort;
  dir?: CompanySortDir;
}) {
  const pageHref = (target: number) =>
    buildListHref({ search, type, bookedOnly, sort, dir, page: target });

  return (
    <nav
      aria-label="Company pages"
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
    new Date(`${date}T00:00:00`),
  );
}
