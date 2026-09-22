"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import type { OpportunityInquiry } from "@/lib/ghl/inquiry-fields";

// Icon button on an Opportunities card that opens a pop-up with the
// original inquiry: what the contact put on the website form (or what a
// coordinator recorded on the New inquiry page), read from the
// opportunity's custom fields in GHL.

export type InquiryContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OpportunityInquiryButton({
  opportunityName,
  contact,
  inquiry,
  createdAt,
  inquirySource,
}: {
  opportunityName: string | null;
  contact: InquiryContact | null;
  inquiry: OpportunityInquiry;
  // When GHL created the opportunity (the form submission time).
  createdAt: string | null;
  // "form" = website form; "phone" = New inquiry page; null = unknown.
  inquirySource: "form" | "phone" | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip label="Original inquiry">
        <button
          aria-label="View the original inquiry"
          className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={() => setOpen(true)}
          type="button"
        >
          <FormIcon size={15} />
        </button>
      </Tooltip>
      {open ? (
        <InquiryModal
          contact={contact}
          createdAt={createdAt}
          inquiry={inquiry}
          inquirySource={inquirySource}
          onClose={() => setOpen(false)}
          opportunityName={opportunityName}
        />
      ) : null}
    </>
  );
}

function InquiryModal({
  opportunityName,
  contact,
  inquiry,
  createdAt,
  inquirySource,
  onClose,
}: {
  opportunityName: string | null;
  contact: InquiryContact | null;
  inquiry: OpportunityInquiry;
  createdAt: string | null;
  inquirySource: "form" | "phone" | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const submitted = formatDateTime(createdAt);
  const sourceLine =
    inquirySource === "phone"
      ? "Taken by phone on the New inquiry page"
      : inquirySource === "form"
        ? "Submitted on the website inquiry form"
        : "As recorded on the GoHighLevel opportunity";

  const quickAnswers: [string, string | null][] = [
    ["Catering", inquiry.catering],
    ["Venue rental", inquiry.venueRental],
    ["Lodging interest", inquiry.accommodationInterest],
    ["Visited before", inquiry.visitedPrior],
    ["Date flexible", inquiry.dateFlexibility],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/40"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="inquiry-modal-title"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="type-label text-slate-500">Original inquiry</p>
            <h2
              className="mt-0.5 truncate text-base font-semibold text-slate-950"
              id="inquiry-modal-title"
            >
              {inquiry.groupEventName || opportunityName || "Untitled inquiry"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {sourceLine}
              {submitted ? ` · ${submitted}` : ""}
            </p>
          </div>
          <button
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <Section title="Contact">
            <Field label="Name" value={contact?.name} />
            <Field label="Email" value={contact?.email} />
            <Field label="Phone" value={contact?.phone} />
            <Field label="Company / organization" value={inquiry.companyName} />
          </Section>

          <Section title="Event">
            <Field label="Group or event name" value={inquiry.groupEventName} />
            <Field label="Inquiry type" value={inquiry.inquiryType} />
            <Field label="Location" value={inquiry.location} />
            <Field label="Date of interest" value={formatDate(inquiry.dateOfInterest)} />
            <Field
              label="Number of guests"
              value={inquiry.numberOfGuests !== null ? String(inquiry.numberOfGuests) : null}
            />
            <Field label="Activity interest" value={inquiry.activityInterest} />
          </Section>

          <Section title="Quick questions">
            {quickAnswers.map(([label, value]) => (
              <Field key={label} label={label} value={value} />
            ))}
          </Section>

          <Section title="Message">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800 sm:col-span-2">
              {inquiry.message || <span className="text-slate-400">No message.</span>}
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-100 py-3 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="type-label text-slate-500">{title}</h3>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm ${value ? "text-slate-800" : "text-slate-400"}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function FormIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <rect height="18" rx="2" width="14" x="5" y="3" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}
