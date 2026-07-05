import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  buildChecklistReviewSummary,
  getChecklistReviewClassName,
} from "@/lib/admin/checklist-review-presenters";
import {
  buildUploadReviewSummary,
  formatUploadFileSize,
  getUploadReviewClassName,
  isClientUploadNeedingReview,
} from "@/lib/admin/upload-review-presenters";
import {
  buildVendorReviewSummary,
  formatVendorReviewSourceLabel,
  getVendorReviewClassName,
  isClientSubmittedVendorNeedingReview,
} from "@/lib/admin/vendor-submission-presenters";
import {
  listActiveChecklistTemplates,
  listEventChecklistItems,
  type AdminChecklistTemplateOption,
  type AdminEventChecklistItem,
} from "@/lib/admin/checklist-templates";
import {
  getAdminEventById,
  listEventUploads,
  listEventVendors,
  type AdminEventUpload,
  type AdminEventVendor,
} from "@/lib/admin/events";
import { formatDisplayDate } from "@/lib/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  applyChecklistTemplateAction,
  launchPortalAction,
  reviewUploadAction,
  reviewVendorSubmissionAction,
  updateChecklistItemAction,
} from "./actions";

const statusLabels = {
  draft: "Draft",
  launched: "Launched",
  expired: "Expired",
  archived: "Archived",
} as const;

const syncStatusLabels = {
  success: "Success",
  warning: "Warning",
  error: "Error",
} as const;

type AdminEventDetailPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    checklist?: string;
    launched?: string;
    upload?: string;
    vendor?: string;
  }>;
};

export default async function AdminEventDetailPage({
  params,
  searchParams,
}: AdminEventDetailPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { eventId } = await params;
  const { checklist, launched, upload, vendor } = await searchParams;
  const [event, checklistItems, checklistTemplates, vendors, uploads] = await Promise.all([
    getAdminEventById(eventId),
    listEventChecklistItems(eventId),
    listActiveChecklistTemplates(),
    listEventVendors(eventId),
    listEventUploads(eventId),
  ]);

  if (!event) {
    notFound();
  }

  return (
    <AdminShell
      description="Read-only event details from Supabase and the latest GoHighLevel snapshot stored for this portal event."
      eyebrow="Event Details"
      title={event.eventName}
      userEmail={user.email}
    >
      <div>
        <Link
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          href="/admin/events"
        >
          Back to events
        </Link>
      </div>

      {launched === "1" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Portal launch prepared. The secure URL is stored below. Client
          notification is still separate and should be handled through
          GoHighLevel.
        </div>
      ) : null}

      {checklist === "applied" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Checklist template applied. Event-specific checklist items are now
          available for planner review.
        </div>
      ) : null}

      {checklist === "updated" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Checklist item updated. The client portal will reflect the latest
          client-visible item details after launch.
        </div>
      ) : null}

      {vendor === "reviewed" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Vendor submission marked reviewed. This app did not sync the vendor
          back to GoHighLevel or notify the client.
        </div>
      ) : null}

      {upload === "reviewed" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          Upload marked reviewed. The file remains private in Supabase Storage;
          this app did not sync it to GoHighLevel or notify the client.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <DetailCard label="Portal status" value={statusLabels[event.status]} />
        <DetailCard
          label="Event date"
          value={formatNullableDate(event.eventDate)}
        />
        <DetailCard
          label="Sync status"
          value={
            event.lastSyncStatus
              ? syncStatusLabels[event.lastSyncStatus]
              : "Not synced"
          }
        />
      </section>

      <DetailSection title="Launch preview">
        <DetailRow label="Launch readiness" value={getLaunchReadiness(event)} />
        <DetailRow
          label="Portal access prepared"
          value={event.hasPortalTokenHash || event.clientPortalUrl ? "Yes" : "No"}
        />
        <DetailRow label="Stored portal URL" value={event.clientPortalUrl} />
        <DetailRow label="Launched" value={formatNullableDateTime(event.launchedAt)} />
        <DetailRow
          label="Client notification"
          value="Not sent by this app. GoHighLevel remains responsible for client email/SMS after planner approval."
        />
        <DetailRow
          label="Next launch action"
          value={
            canShowLaunchForm(event)
              ? "Use the gated launch action below to generate a secure URL. Client notification remains separate/GHL-owned."
              : "No launch action is currently available for this event state."
          }
        />
        {canShowLaunchForm(event) ? (
          <div className="grid gap-3 py-3 text-sm sm:grid-cols-3 sm:gap-4">
            <dt className="font-semibold text-slate-500">Launch action</dt>
            <dd className="space-y-3 sm:col-span-2">
              <p className="text-slate-700">
                This prepares the client portal URL only. It does not text,
                email, or update GoHighLevel.
              </p>
              <form action={launchPortalAction} className="space-y-3">
                <input name="eventId" type="hidden" value={event.id} />
                <label className="flex gap-2 text-sm text-slate-700">
                  <input
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                    name="launchConfirmation"
                    required
                    type="checkbox"
                    value="planner-approved-launch"
                  />
                  <span>
                    Planner has reviewed this event and approves preparing the
                    portal link.
                  </span>
                </label>
                <button
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  type="submit"
                >
                  Prepare portal launch
                </button>
              </form>
            </dd>
          </div>
        ) : null}
      </DetailSection>

      <ChecklistSetupSection
        eventId={event.id}
        eventStatus={event.status}
        items={checklistItems}
        templates={checklistTemplates}
      />

      <VendorSubmissionsSection eventId={event.id} vendors={vendors} />

      <UploadReviewSection eventId={event.id} uploads={uploads} />

      <section className="grid gap-6 xl:grid-cols-2">
        <DetailSection title="Event summary">
          <DetailRow label="Event type" value={event.eventType} />
          <DetailRow label="Arrival time" value={event.arrivalTime} />
          <DetailRow label="Meeting location" value={event.meetingLocation} />
          <DetailRow label="Payment status" value={event.paymentStatus} />
        </DetailSection>

        <DetailSection title="Planner">
          <DetailRow label="Name" value={event.plannerName} />
          <DetailRow label="Email" value={event.plannerEmail} />
          <DetailRow label="Phone" value={event.plannerPhone} />
        </DetailSection>

        <DetailSection title="Portal activity">
          <DetailRow label="Portal URL" value={event.clientPortalUrl} />
          <DetailRow label="Launched" value={formatNullableDateTime(event.launchedAt)} />
          <DetailRow
            label="Public expires"
            value={formatNullableDateTime(event.publicExpiresAt)}
          />
          <DetailRow label="Expired" value={formatNullableDateTime(event.expiredAt)} />
          <DetailRow
            label="First viewed"
            value={formatNullableDateTime(event.firstViewedAt)}
          />
          <DetailRow
            label="Last viewed"
            value={formatNullableDateTime(event.lastViewedAt)}
          />
          <DetailRow label="View count" value={String(event.viewCount)} />
        </DetailSection>

        <DetailSection title="GoHighLevel references">
          <DetailRow label="Event record ID" value={event.ghlEventRecordId} />
          <DetailRow label="Contact ID" value={event.ghlContactId} />
          <DetailRow label="Opportunity ID" value={event.ghlOpportunityId} />
          <DetailRow label="Proposal link" value={event.proposalUrl} />
          <DetailRow label="Contract link" value={event.contractUrl} />
          <DetailRow label="Invoice link" value={event.invoiceUrl} />
          <DetailRow label="Payment link" value={event.paymentUrl} />
        </DetailSection>
      </section>

      <DetailSection title="Sync metadata">
        <DetailRow
          label="Last synced"
          value={formatNullableDateTime(event.lastSyncedAt)}
        />
        <DetailRow label="Last sync error" value={event.lastSyncError} />
        <DetailRow label="Created" value={formatNullableDateTime(event.createdAt)} />
        <DetailRow label="Updated" value={formatNullableDateTime(event.updatedAt)} />
      </DetailSection>
    </AdminShell>
  );
}

type ChecklistSetupSectionProps = {
  eventId: string;
  eventStatus: keyof typeof statusLabels;
  items: AdminEventChecklistItem[];
  templates: AdminChecklistTemplateOption[];
};

function ChecklistSetupSection({
  eventId,
  eventStatus,
  items,
  templates,
}: ChecklistSetupSectionProps) {
  const canApplyTemplate = eventStatus === "draft" && items.length === 0;
  const reviewSummary = buildChecklistReviewSummary(items);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Checklist setup</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Apply one seeded template, then make event-specific planner edits to
            item status, title, description, and visibility. Reordering and full
            template editing are intentionally deferred.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length > 0 ? (
        <div
          className={
            reviewSummary.hasItemsNeedingReview
              ? "mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
              : "mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
          }
        >
          <p className="font-semibold">{reviewSummary.label}</p>
          {reviewSummary.hasItemsNeedingReview ? (
            <p className="mt-1">
              Client-submitted items are highlighted below. Review them and set
              status to Completed when planner approval is done.
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-5 divide-y divide-slate-200">
          {items.map((item) => (
            <li className="py-4" key={item.id}>
              <form
                action={updateChecklistItemAction}
                className={getChecklistReviewClassName(item.status)}
              >
                {item.status === "needs_review" ? (
                  <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                    Needs planner review from client submission
                  </p>
                ) : null}
                <input name="eventId" type="hidden" value={eventId} />
                <input name="itemId" type="hidden" value={item.id} />
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Item title
                    <input
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
                      name="title"
                      required
                      type="text"
                      defaultValue={item.title}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Status
                    <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
                      name="status"
                      defaultValue={item.status}
                    >
                      <option value="not_completed">Not completed</option>
                      <option value="needs_review">Needs review</option>
                      <option value="completed">Completed</option>
                      <option value="not_applicable">Not applicable</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Description
                  <textarea
                    className="min-h-24 rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
                    name="description"
                    defaultValue={item.description ?? ""}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      className="h-4 w-4 rounded border-slate-300"
                      defaultChecked={item.required}
                      name="required"
                      type="checkbox"
                    />
                    Required
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      className="h-4 w-4 rounded border-slate-300"
                      defaultChecked={item.clientVisible}
                      name="clientVisible"
                      type="checkbox"
                    />
                    Client-visible
                  </label>
                </div>
                <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                  <ChecklistMeta
                    label="Due date"
                    value={formatNullableDate(item.dueDate)}
                  />
                  <ChecklistMeta
                    label="Completion"
                    value={formatStatusLabel(item.completionMode)}
                  />
                  <ChecklistMeta
                    label="Client can complete"
                    value={item.clientCompletable ? "Yes" : "No"}
                  />
                </dl>
                <div>
                  <button
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    type="submit"
                  >
                    Save checklist item
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm text-slate-700">
            No event-specific checklist items have been applied yet.
          </p>
        </div>
      )}

      {canApplyTemplate ? (
        templates.length > 0 ? (
          <form
            action={applyChecklistTemplateAction}
            className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          >
            <input name="eventId" type="hidden" value={eventId} />
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Checklist template
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950"
                name="templateId"
                required
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.eventType ? ` — ${template.eventType}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="submit"
            >
              Apply template
            </button>
          </form>
        ) : (
          <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No active checklist templates are available yet. Apply the local seed
            or add real templates before setting up this event checklist.
          </p>
        )
      ) : null}
    </section>
  );
}

function VendorSubmissionsSection({
  eventId,
  vendors,
}: {
  eventId: string;
  vendors: AdminEventVendor[];
}) {
  const reviewSummary = buildVendorReviewSummary(vendors);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Vendor submissions</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Review vendor details submitted through the client portal. This view is
            read-only for now; planner approval, editing, GHL writeback, and file
            uploads remain separate future workflows.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
        </span>
      </div>

      {vendors.length > 0 ? (
        <div
          className={
            reviewSummary.hasVendorsNeedingReview
              ? "mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
              : "mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
          }
        >
          <p className="font-semibold">{reviewSummary.label}</p>
          {reviewSummary.hasVendorsNeedingReview ? (
            <p className="mt-1">
              Client-submitted vendors are highlighted below so planners can
              review before using them in final event materials.
            </p>
          ) : null}
        </div>
      ) : null}

      {vendors.length > 0 ? (
        <ul className="mt-5 grid gap-4 xl:grid-cols-2">
          {vendors.map((vendor) => (
            <li className={getVendorReviewClassName(vendor.metadata)} key={vendor.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-950">
                  {vendor.companyName || vendor.contactName || "Unnamed vendor"}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {formatVendorReviewSourceLabel(vendor.metadata)}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <ChecklistMeta label="Vendor type" value={vendor.vendorType || "Not set"} />
                <ChecklistMeta label="Contact" value={vendor.contactName || "Not set"} />
                <ChecklistMeta label="Email" value={vendor.email || "Not set"} />
                <ChecklistMeta label="Phone" value={vendor.phone || "Not set"} />
                <ChecklistMeta label="Submitted" value={formatNullableDateTime(vendor.createdAt)} />
              </dl>
              {vendor.notes ? (
                <div className="mt-4 rounded-xl bg-white/70 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
                  <p className="font-semibold text-slate-500">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{vendor.notes}</p>
                </div>
              ) : null}
              {isClientSubmittedVendorNeedingReview(vendor) ? (
                <form action={reviewVendorSubmissionAction} className="mt-4">
                  <input name="eventId" type="hidden" value={eventId} />
                  <input name="vendorId" type="hidden" value={vendor.id} />
                  <button
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    type="submit"
                  >
                    Mark vendor reviewed
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm text-slate-700">
            No vendor submissions are connected to this event yet. Client portal
            submissions will appear here automatically after launch.
          </p>
        </div>
      )}
    </section>
  );
}

function UploadReviewSection({
  eventId,
  uploads,
}: {
  eventId: string;
  uploads: AdminEventUpload[];
}) {
  const reviewSummary = buildUploadReviewSummary(uploads);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Upload review</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Review files submitted through the client portal. Download links are
            temporary signed URLs for planner review only.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {uploads.length} upload{uploads.length === 1 ? "" : "s"}
        </span>
      </div>

      {uploads.length > 0 ? (
        <div
          className={
            reviewSummary.hasUploadsNeedingReview
              ? "mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
              : "mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
          }
        >
          <p className="font-semibold">{reviewSummary.label}</p>
          {reviewSummary.hasUploadsNeedingReview ? (
            <p className="mt-1">
              Client-submitted uploads are highlighted below. Review the file,
              then mark it reviewed when planner approval is done.
            </p>
          ) : null}
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <ul className="mt-5 grid gap-4 xl:grid-cols-2">
          {uploads.map((upload) => (
            <li className={getUploadReviewClassName(upload)} key={upload.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-all text-base font-semibold text-slate-950">
                  {upload.fileName}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {isClientUploadNeedingReview(upload) ? "Needs review" : "Reviewed"}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <ChecklistMeta label="Type" value={upload.fileMimeType} />
                <ChecklistMeta
                  label="Size"
                  value={formatUploadFileSize(upload.fileSizeBytes)}
                />
                <ChecklistMeta label="Uploaded by" value={upload.uploadedBy} />
                <ChecklistMeta
                  label="Uploaded"
                  value={formatNullableDateTime(upload.uploadedAt)}
                />
              </dl>
              <div className="mt-4 flex flex-wrap gap-3">
                {upload.signedUrl ? (
                  <a
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    href={upload.signedUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open signed download
                  </a>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
                    Download unavailable
                  </span>
                )}
                {isClientUploadNeedingReview(upload) ? (
                  <form action={reviewUploadAction}>
                    <input name="eventId" type="hidden" value={eventId} />
                    <input name="uploadId" type="hidden" value={upload.id} />
                    <button
                      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      type="submit"
                    >
                      Mark upload reviewed
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm text-slate-700">
            No files are connected to this event yet. Client portal uploads will
            appear here automatically after launch.
          </p>
        </div>
      )}
    </section>
  );
}

type ChecklistMetaProps = {
  label: string;
  value: string;
};

function ChecklistMeta({ label, value }: ChecklistMetaProps) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-800">{value}</dd>
    </div>
  );
}

type DetailCardProps = {
  label: string;
  value: string;
};

function DetailCard({ label, value }: DetailCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}

type DetailSectionProps = {
  children: React.ReactNode;
  title: string;
};

function DetailSection({ children, title }: DetailSectionProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <dl className="mt-4 divide-y divide-slate-200">{children}</dl>
    </section>
  );
}

type DetailRowProps = {
  label: string;
  value: string | null;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="grid gap-1 py-3 text-sm sm:grid-cols-3 sm:gap-4">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="break-words text-slate-800 sm:col-span-2">
        {value || "Not set"}
      </dd>
    </div>
  );
}

function formatNullableDate(date: string | null): string {
  return date ? formatDisplayDate(date) : "Not set";
}

function formatStatusLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatNullableDateTime(date: string | null): string {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function getLaunchReadiness(event: {
  clientPortalUrl: string | null;
  hasPortalTokenHash: boolean;
  status: keyof typeof statusLabels;
}): string {
  if (event.status === "launched") {
    return event.clientPortalUrl && event.hasPortalTokenHash
      ? "Launched with portal access prepared"
      : "Launched, but portal access values need review";
  }

  if (event.status === "draft") {
    return event.clientPortalUrl || event.hasPortalTokenHash
      ? "Draft with existing portal access values — review before launch"
      : "Draft and ready for future launch preparation";
  }

  return "Not launchable in current status";
}

function canShowLaunchForm(event: {
  clientPortalUrl: string | null;
  hasPortalTokenHash: boolean;
  status: keyof typeof statusLabels;
}): boolean {
  return (
    event.status === "draft" && !event.clientPortalUrl && !event.hasPortalTokenHash
  );
}
