import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { FlashBanner } from "@/components/admin/flash-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import {
  approveContactAction,
  excludeContactAction,
  restoreContactAction,
} from "@/app/admin/system/sf-migration/actions";
import {
  getCompanyDetail,
  type SfAccountRow,
  type SfContactRow,
  type SfOpportunityRow,
} from "@/lib/admin/companies";
import { getUserRole } from "@/lib/admin/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Company detail: the Salesforce-account view their sales team is used to,
// rebuilt on the app's own archive — header stats computed live from the
// opportunity history, contacts, and the full booking timeline. Dollar
// amounts are admin-only, matching the Opportunities page.

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// Their org's Event Sales stages, plus a neutral fallback for anything else.
const stageTones: Record<string, BadgeTone> = {
  Booked: "success",
  "Event Occured": "info",
  "Sent Proposal": "warning",
  "Did Not Book": "neutral",
};

// Same GHL-migration status flow as /admin/system/sf-migration, keyed off
// sf_contacts.push_status. The actual GHL push ships with that screen; from
// here admins mark this company's contacts approved/excluded in place.
const pushStatusLabels: Record<SfContactRow["push_status"], string> = {
  staged: "Staged",
  approved: "Approved",
  excluded: "Excluded",
  pushed: "Pushed",
  error: "Error",
};

const pushStatusTones: Record<SfContactRow["push_status"], BadgeTone> = {
  staged: "neutral",
  approved: "success",
  excluded: "warning",
  pushed: "info",
  error: "danger",
};

type CompanyDetailPageProps = {
  params: Promise<{ sfId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function CompanyDetailPage({
  params,
  searchParams,
}: CompanyDetailPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }
  const isAdmin = getUserRole(user) === "admin";

  const { sfId } = await params;
  const { notice, error } = await searchParams;
  const detail = await getCompanyDetail(sfId);
  if (!detail) notFound();

  const { account, stats, contacts, opportunities, duplicates } = detail;

  const wonValue = opportunities
    .filter((opp) => opp.is_won)
    .reduce((sum, opp) => sum + (opp.total_amount ?? opp.amount ?? 0), 0);

  const meta = account.type ? (
    <StatusBadge tone="neutral">{account.type}</StatusBadge>
  ) : undefined;

  return (
    <AdminShell
      backHref="/admin/companies"
      backLabel="Companies"
      description={<CompanyFacts account={account} />}
      meta={meta}
      title={account.name || "(unnamed company)"}
      userEmail={user.email}
    >
      {notice ? <FlashBanner>{notice}</FlashBanner> : null}

      {error ? <FlashBanner tone="error">{error}</FlashBanner> : null}

      {duplicates.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">
            {duplicates.length} other compan
            {duplicates.length === 1 ? "y" : "ies"} in the archive share this
            name — history below may be split across them:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {duplicates.map((dupe) => (
              <li key={dupe.sf_id}>
                <Link
                  className="font-semibold underline underline-offset-4 hover:text-amber-950"
                  href={`/admin/companies/${dupe.sf_id}`}
                >
                  {dupe.name}
                </Link>{" "}
                ({dupe.won_count.toLocaleString()} booked,{" "}
                {dupe.contact_count.toLocaleString()} contact
                {dupe.contact_count === 1 ? "" : "s"})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className={`grid gap-4 md:grid-cols-2 ${isAdmin ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}
      >
        <AdminStatCard
          hint="Won opportunities, all time"
          label="Events booked"
          value={(stats?.won_count ?? 0).toLocaleString()}
        />
        <AdminStatCard
          hint={`Currently in the Booked stage${stats?.upcoming_booked_count === account.number_of_booked_opportunities ? "" : ` (Salesforce roll-up said ${account.number_of_booked_opportunities ?? 0})`}`}
          label="Upcoming booked"
          value={(stats?.upcoming_booked_count ?? 0).toLocaleString()}
        />
        <AdminStatCard
          hint="Most recent past event across won opportunities"
          label="Last event"
          value={
            stats?.last_event_date ? formatDate(stats.last_event_date) : "—"
          }
        />
        <AdminStatCard
          hint="Soonest upcoming booked event"
          label="Next event"
          value={
            stats?.next_event_date ? formatDate(stats.next_event_date) : "—"
          }
        />
        <AdminStatCard
          hint="Contacts tied to this company"
          label="Contacts"
          value={contacts.length.toLocaleString()}
        />
        {isAdmin ? (
          <AdminStatCard
            hint="Sum of won opportunity amounts"
            label="Won value"
            value={currency.format(wonValue)}
          />
        ) : null}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Contacts</h2>
            {isAdmin ? (
              <p className="mt-0.5 text-sm text-slate-600">
                Click a contact&apos;s ⓘ to view its migration status or
                approve it for HighLevel — same flow as Admin → SF Migration.
              </p>
            ) : null}
          </header>
          {contacts.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {contacts.map((contact) => (
                <ContactRow
                  contact={contact}
                  isAdmin={isAdmin}
                  key={contact.sf_id}
                  returnTo={`/admin/companies/${sfId}`}
                />
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                description="No staged Salesforce contacts reference this account."
                title="No contacts"
              />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-950">
              Booking history
            </h2>
            <p className="text-sm text-slate-500">
              {opportunities.length.toLocaleString()} opportunit
              {opportunities.length === 1 ? "y" : "ies"} from the Salesforce
              archive
            </p>
          </header>
          {opportunities.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {opportunities.map((opp) => (
                <OpportunityRow isAdmin={isAdmin} key={opp.sf_id} opp={opp} />
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                description="No opportunities reference this account in the archive."
                title="No booking history"
              />
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

// Sentence shown in the expanded status panel; wording per Austin
// (2026-08-31), adjusted for statuses where Approve doesn't apply.
function pushStatusDescription(status: SfContactRow["push_status"]): string {
  switch (status) {
    case "pushed":
      return "This contact has already been pushed to HighLevel.";
    case "approved":
      return "This contact is approved and will be included in the next push to HighLevel.";
    case "excluded":
      return "This contact is excluded. Click Approve to push this contact to HighLevel instead.";
    case "error":
      return "This contact hit an error on the last push. Click Approve to retry it.";
    default:
      return "This contact is staged. Click Approve to push this contact to HighLevel.";
  }
}

function ContactRow({
  contact,
  isAdmin,
  returnTo,
}: {
  contact: SfContactRow;
  isAdmin: boolean;
  returnTo: string;
}) {
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    "(no name)";

  const info = (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-2 font-semibold text-slate-950">
        {name}
        {contact.title ? (
          <span className="text-xs font-medium text-slate-500">
            {contact.title}
          </span>
        ) : null}
      </p>
      <p className="truncate text-sm text-slate-600">
        {[contact.email, contact.phone].filter(Boolean).join(" · ") ||
          "No contact info"}
      </p>
    </div>
  );

  if (!isAdmin) {
    return <li className="px-5 py-3">{info}</li>;
  }

  return (
    <li className="relative px-5 py-3">
      <div className="pr-8">{info}</div>
      <details className="group">
        <summary
          aria-label={`Migration status for ${name}`}
          className="absolute right-4 top-2.5 cursor-pointer list-none rounded-full p-1 text-slate-400 transition group-open:text-slate-950 hover:bg-slate-100 hover:text-slate-950 [&::-webkit-details-marker]:hidden"
          title="Toggle to view status or push to High Level."
        >
          <Icon className="h-4 w-4">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </Icon>
        </summary>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge tone={pushStatusTones[contact.push_status]}>
              {pushStatusLabels[contact.push_status]}
            </StatusBadge>
            <p className="text-sm text-slate-600">
              {pushStatusDescription(contact.push_status)}
            </p>
          </div>
          {contact.push_status !== "pushed" ? (
            <div className="flex items-center gap-2">
              {contact.push_status !== "approved" ? (
                <ContactAction
                  action={approveContactAction}
                  label="Approve"
                  name={name}
                  returnTo={returnTo}
                  sfId={contact.sf_id}
                  tone="primary"
                />
              ) : null}
              {contact.push_status !== "excluded" ? (
                <ContactAction
                  action={excludeContactAction}
                  label="Exclude"
                  name={name}
                  returnTo={returnTo}
                  sfId={contact.sf_id}
                  tone="secondary"
                />
              ) : null}
              {contact.push_status !== "staged" ? (
                <ContactAction
                  action={restoreContactAction}
                  label="Restore"
                  name={name}
                  returnTo={returnTo}
                  sfId={contact.sf_id}
                  tone="secondary"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function ContactAction({
  action,
  label,
  name,
  returnTo,
  sfId,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  name: string;
  returnTo: string;
  sfId: string;
  tone: "primary" | "secondary";
}) {
  return (
    <form action={action}>
      <input name="sfId" type="hidden" value={sfId} />
      <input name="name" type="hidden" value={name} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <button
        className={
          tone === "primary"
            ? "rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
            : "rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        }
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

// One labeled line per known fact, matching how the account header reads in
// Salesforce. Accounts have no email field; website stands in when set.
function CompanyFacts({ account }: { account: SfAccountRow }) {
  const location = [account.billing_city, account.billing_state]
    .filter(Boolean)
    .join(", ");
  const facts = [
    { label: "Salesforce Owner", value: account.owner_name },
    { label: "Phone", value: account.phone },
    { label: "Website", value: account.website },
    { label: "Location", value: location || null },
  ].filter((fact) => fact.value);

  if (facts.length === 0) return null;

  return (
    <>
      {facts.map((fact) => (
        <span className="block" key={fact.label}>
          <span className="font-semibold text-slate-500">{fact.label}: </span>
          {fact.value}
        </span>
      ))}
    </>
  );
}

function OpportunityRow({
  opp,
  isAdmin,
}: {
  opp: SfOpportunityRow;
  isAdmin: boolean;
}) {
  const date = opp.event_date ?? opp.close_date;
  const amount = opp.total_amount ?? opp.amount;

  const facts = [
    opp.head_count ? `${opp.head_count.toLocaleString()} guests` : null,
    isAdmin && amount ? currency.format(amount) : null,
    opp.owner_name,
  ].filter(Boolean);

  return (
    <li className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-950">
          {opp.name || "(unnamed opportunity)"}
        </p>
        <p className="truncate text-sm text-slate-600">
          {[
            date ? formatDate(date) : "No date",
            ...facts,
          ].join(" · ")}
        </p>
      </div>
      <StatusBadge tone={stageTones[opp.stage_name ?? ""] ?? "neutral"}>
        {opp.stage_name || "No stage"}
      </StatusBadge>
    </li>
  );
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(`${date}T00:00:00`),
  );
}
