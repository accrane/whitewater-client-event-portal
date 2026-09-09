import Link from "next/link";

import { ChecklistFaq } from "@/components/checklist/checklist-faq";
import { ClientHero } from "@/components/client/client-hero";
import { ClientPortalNav } from "@/components/client/client-portal-nav";
import { ClientContractSigner } from "@/components/client/client-contract-signer";
import { ClientSectionCard } from "@/components/client/client-section-card";
import { getEventChecklistSections } from "@/lib/admin/checklist-sections";
import { listClientContracts } from "@/lib/admin/contracts";
import type { EventChecklistSection } from "@/lib/checklist";
import { formatDisplayDate } from "@/lib/dates";
import { getClientPortalEventByToken } from "@/lib/client/portal";
import { buildMergeTagContext, resolveMergeTags } from "@/lib/merge-tags";

import {
  markChecklistSectionReadyAction,
  submitFacilitatorAction,
  submitVendorAction,
  uploadFileAction,
} from "./actions";

type ClientPortalPlaceholderPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    checklist?: string;
    facilitator?: string;
    upload?: string;
    vendor?: string;
  }>;
};

export default async function ClientPortalPlaceholderPage({
  params,
  searchParams,
}: ClientPortalPlaceholderPageProps) {
  const { token } = await params;
  const { checklist, facilitator, upload, vendor } = await searchParams;
  const event = await getClientPortalEventByToken(token);

  if (!event) {
    return <InvalidOrUnavailablePortal token={token} />;
  }

  // Merge tags like {{event.num_attendees}} resolve at view time so the
  // client always sees the latest GHL-synced values.
  const mergeContext = buildMergeTagContext(event);
  const contracts = await listClientContracts(event.id);
  const checklistSections = (await getEventChecklistSections(event.id)).map(
    (section) => ({
      ...section,
      content_html: resolveMergeTags(section.content_html, mergeContext),
    }),
  );

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <ClientPortalNav active="overview" token={token} />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ClientHero title={event.eventName} />

          <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
            <SummaryItem
              label="Event date"
              value={formatNullableDate(event.eventDate)}
            />
            <SummaryItem
              label="Arrival time"
              value={event.arrivalTime || "Not set"}
            />
            <SummaryItem
              label="Meeting location"
              value={event.meetingLocation || "Not set"}
            />
          </div>
        </section>

        {checklist === "received" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Checklist update received. Your planner will review it before it is
            marked complete.
          </div>
        ) : null}

        {facilitator === "received" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Facilitator contact info received. Your planner will review it and
            reach out to coordinate event details.
          </div>
        ) : null}

        {vendor === "received" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Vendor information received. Your planner will review it before it
            appears in final event materials.
          </div>
        ) : null}

        {upload === "received" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            File received. Your planner will review it before using it in final
            event materials.
          </div>
        ) : null}

        <ClientChecklistAccordion sections={checklistSections} token={token} />

        <ClientSectionCard
          description="Your event contracts. Review each one and sign it right here — no separate email or account needed."
          title="Contracts"
        >
          <ClientContractSigner contracts={contracts} token={token} />
        </ClientSectionCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ClientSectionCard
            description="Your event type, payment status, and main planning details."
            title="Event summary"
          >
            <DetailList
              rows={[
                ["Event type", event.eventType],
                ["Payment status", event.paymentStatus],
                ["Event date", formatNullableDate(event.eventDate)],
                [
                  "Activity passes",
                  formatNullableCount(event.activityPassCount),
                ],
                [
                  "Parking passes",
                  formatNullableCount(event.numberOfParkingPasses),
                ],
                [
                  "Storage bins",
                  formatNullableCount(event.numberOfStorageBins),
                ],
              ]}
            />
          </ClientSectionCard>

          <ClientSectionCard
            description="Use your normal planner contact channels for questions."
            title="Planner contact"
          >
            <DetailList
              rows={[
                ["Name", event.plannerName],
                ["Email", event.plannerEmail],
                ["Phone", event.plannerPhone],
              ]}
            />
          </ClientSectionCard>

          <ClientSectionCard
            description="Links synced from GoHighLevel for proposal, contract, invoice, and payment."
            title="Documents and payment"
          >
            <LinkList
              links={[
                ["Proposal", event.proposalUrl],
                ["Contract", event.contractUrl],
                ["Invoice", event.invoiceUrl],
                ["Payment", event.paymentUrl],
              ]}
            />
          </ClientSectionCard>

          <ClientSectionCard
            description="If someone besides you will run point on event day, share their contact info so our team can coordinate with them directly."
            title="Event facilitator"
          >
            <div className="space-y-4">
              {event.facilitatorName || event.facilitatorSameAsContact ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">
                    {event.facilitatorSameAsContact
                      ? `Same as your main contact${
                          event.facilitatorName
                            ? ` (${event.facilitatorName})`
                            : ""
                        }`
                      : event.facilitatorName}
                  </p>
                  {!event.facilitatorSameAsContact ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {[event.facilitatorEmail, event.facilitatorPhone]
                        .filter(Boolean)
                        .join(" · ") || "No contact details on file"}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    {event.facilitatorStatus === "needs_review"
                      ? "Submitted — waiting on planner review."
                      : "On file with your planner."}{" "}
                    Submit the form again to update it.
                  </p>
                </div>
              ) : null}
              <form
                action={submitFacilitatorAction}
                className="grid gap-3 rounded-xl bg-slate-50 p-4"
              >
                <input name="token" type="hidden" value={token} />
                <label className="peer flex items-start gap-2 text-sm font-semibold text-slate-700">
                  <input
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    defaultChecked={event.facilitatorSameAsContact}
                    name="sameAsContact"
                    type="checkbox"
                  />
                  Same as our current contact — the person you&apos;ve been
                  working with will also run the event day.
                </label>
                <div className="grid gap-3 peer-has-checked:hidden sm:grid-cols-2">
                  <ClientInput
                    defaultValue={event.facilitatorName}
                    label="Name"
                    name="name"
                    placeholder="Facilitator's full name"
                  />
                  <ClientInput
                    defaultValue={event.facilitatorEmail}
                    label="Email"
                    name="email"
                    placeholder="facilitator@example.com"
                    type="email"
                  />
                  <ClientInput
                    defaultValue={event.facilitatorPhone}
                    label="Phone"
                    name="phone"
                    placeholder="Phone number"
                  />
                </div>
                <button
                  className="justify-self-start rounded-md border border-[var(--brand-border)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition hover:bg-[var(--brand-hover)]"
                  type="submit"
                >
                  {event.facilitatorName || event.facilitatorSameAsContact
                    ? "Update facilitator info"
                    : "Submit facilitator info"}
                </button>
              </form>
            </div>
          </ClientSectionCard>

          <ClientSectionCard
            description="Share vendor contact details and event files with your planner for review."
            title="Vendors and uploads"
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <CountPill count={event.vendors.length} label="vendors" />
                <CountPill
                  count={event.uploads.length}
                  label="recent uploads"
                />
              </div>
              <form
                action={submitVendorAction}
                className="grid gap-3 rounded-xl bg-slate-50 p-4"
              >
                <input name="token" type="hidden" value={token} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ClientInput
                    label="Vendor type"
                    name="vendorType"
                    placeholder="Caterer, florist, DJ..."
                  />
                  <ClientInput
                    label="Company name"
                    name="companyName"
                    placeholder="Vendor company"
                  />
                  <ClientInput
                    label="Contact name"
                    name="contactName"
                    placeholder="Primary contact"
                  />
                  <ClientInput
                    label="Email"
                    name="email"
                    placeholder="vendor@example.com"
                    type="email"
                  />
                  <ClientInput
                    label="Phone"
                    name="phone"
                    placeholder="Phone number"
                  />
                </div>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Notes
                  <textarea
                    className="min-h-24 rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
                    name="notes"
                    placeholder="Anything your planner should know"
                  />
                </label>
                <button
                  className="justify-self-start rounded-md border border-[var(--brand-border)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition hover:bg-[var(--brand-hover)]"
                  type="submit"
                >
                  Submit vendor info
                </button>
              </form>
              <form
                action={uploadFileAction}
                className="grid gap-3 rounded-xl bg-slate-50 p-4"
              >
                <input name="token" type="hidden" value={token} />
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Upload file
                  <input
                    accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
                    name="file"
                    required
                    type="file"
                  />
                </label>
                <p className="text-xs leading-5 text-slate-500">
                  Accepted files: PDF, JPG, PNG, HEIC, or HEIF up to 25 MB.
                  Uploads are private and require planner review.
                </p>
                <button
                  className="justify-self-start rounded-md border border-[var(--brand-border)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition hover:bg-[var(--brand-hover)]"
                  type="submit"
                >
                  Upload file for review
                </button>
              </form>
              {event.uploads.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-950">
                    Recent uploads
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {event.uploads.map((uploadedFile) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                        key={uploadedFile.id}
                      >
                        <span className="font-medium text-slate-800">
                          {uploadedFile.fileName}
                        </span>
                        <span>
                          {uploadedFile.status === "needs_review"
                            ? "Needs planner review"
                            : "Uploaded"}{" "}
                          · {formatNullableDateTime(uploadedFile.uploadedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </ClientSectionCard>
        </div>
      </div>
    </main>
  );
}

function ClientChecklistAccordion({
  sections,
  token,
}: {
  sections: EventChecklistSection[];
  token: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <p className="type-label text-red-700">Action checklist</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Things to complete for your event
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Click each item to see the details from your planner, then mark it
            ready for review once you&apos;ve completed it.
          </p>
        </div>
        <span className="type-label rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700">
          {sections.length} item{sections.length === 1 ? "" : "s"}
        </span>
      </div>

      {sections.length > 0 ? (
        <div className="mt-5">
          <ChecklistFaq
            markReadyAction={markChecklistSectionReadyAction}
            sections={sections}
            token={token}
          />
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-red-300 bg-red-50/40 p-4 text-sm leading-6 text-slate-700">
          Checklist items will appear here after planner setup.
        </p>
      )}
    </section>
  );
}

function InvalidOrUnavailablePortal({ token }: { token: string }) {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ClientHero
          description="Portal access remains locked until a planner launches the client portal and the secure token is connected to a launched event."
          eyebrow="Client Portal Preview"
          title="This portal link is not active yet."
        />

        <div className="space-y-5 p-6 sm:p-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Demo token</p>
            <p className="mt-1 break-all font-mono text-sm text-slate-800">
              {token}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ClientSectionCard
              description="Event date, arrival time, and room/location from GHL will appear after launch."
              title="Arrival details"
            />
            <ClientSectionCard
              description="Required and optional items with completion status will appear after planner setup."
              title="Checklist"
            />
            <ClientSectionCard
              description="Proposal, contract, invoice, and payment links will appear here when available."
              title="Documents and payment"
            />
            <ClientSectionCard
              description="Vendor submissions and uploads are planned for the client portal workflow."
              title="Vendors and uploads"
            />
          </div>

          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            href="/"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}

function ClientInput({
  defaultValue,
  label,
  name,
  placeholder,
  type = "text",
}: {
  defaultValue?: string | null;
  label: string;
  name: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
        defaultValue={defaultValue ?? undefined}
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="type-label text-slate-500">{label}</p>
      <p className="mt-1.5 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function DetailList({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="divide-y divide-slate-200">
      {rows.map(([label, value]) => (
        <div className="grid gap-1 py-3 text-sm sm:grid-cols-3" key={label}>
          <dt className="type-label text-slate-500">{label}</dt>
          <dd className="text-slate-800 sm:col-span-2">{value || "Not set"}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinkList({ links }: { links: [string, string | null][] }) {
  const availableLinks = links.filter(([, href]) => href);

  if (availableLinks.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No document links are connected yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {availableLinks.map(([label, href]) => (
        <li key={label}>
          <a
            className="font-semibold text-slate-950 underline-offset-4 hover:underline"
            href={href || "#"}
            rel="noreferrer"
            target="_blank"
          >
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function CountPill({ count, label }: { count: number; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-2xl font-semibold text-slate-950">{count}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

function formatNullableDate(date: string | null): string {
  return date ? formatDisplayDate(date) : "Not set";
}

function formatNullableCount(count: number | null): string | null {
  return count === null ? null : String(count);
}

function formatNullableDateTime(date: string | null): string {
  if (!date) {
    return "not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
