"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { EXPEDITED_WINDOW_DAYS, isInsideExpeditedWindow } from "@/lib/ghl/expedited";

import { createPhoneInquiryAction, type PhoneInquiryFormState } from "./actions";

// Intake form for inquiries that didn't come through the website: the same
// questions the web form asks, plus who took the call and whether it's a
// rush. Expedited starts ticked when the date is inside the window and can
// be flipped either way.

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800";
const labelClass = "grid gap-1 text-xs font-semibold text-slate-500";

export function PhoneInquiryForm({
  inquiryTypes,
  locations,
  planners,
}: {
  inquiryTypes: string[];
  locations: string[];
  planners: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<PhoneInquiryFormState, FormData>(
    createPhoneInquiryAction,
    { error: null, existing: null },
  );
  const [date, setDate] = useState("");
  const [expedited, setExpedited] = useState(false);
  // Once the planner touches the checkbox, the date no longer overrides it.
  const [expeditedTouched, setExpeditedTouched] = useState(false);

  const onDateChange = (value: string) => {
    setDate(value);
    if (!expeditedTouched) setExpedited(isInsideExpeditedWindow(value));
  };

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{state.error}</p>
          {state.existing ? (
            <p className="mt-1">
              <Link
                className="font-semibold underline-offset-2 hover:underline"
                href={
                  state.existing.portalEventId
                    ? `/admin/events/${state.existing.portalEventId}`
                    : "/admin/opportunities"
                }
              >
                {state.existing.portalEventId
                  ? "Open their event"
                  : "Find them on the Opportunities page"}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-950">Who called</legend>
        <label className={labelClass}>
          First name
          <input className={inputClass} name="firstName" required type="text" />
        </label>
        <label className={labelClass}>
          Last name
          <input className={inputClass} name="lastName" type="text" />
        </label>
        <label className={labelClass}>
          Email {expedited ? <span className="text-amber-700">(required for expedited)</span> : null}
          <input className={inputClass} name="email" required={expedited} type="email" />
        </label>
        <label className={labelClass}>
          Phone
          <input className={inputClass} name="phone" type="tel" />
        </label>
        <label className={labelClass}>
          Company / organization
          <input className={inputClass} name="companyName" type="text" />
        </label>
        <label className={labelClass}>
          Group or event name
          <input className={inputClass} name="groupEventName" placeholder="e.g. Chapel Hill HS Field Hockey" type="text" />
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-950">The event</legend>
        <label className={labelClass}>
          Inquiry type
          <select className={inputClass} defaultValue={inquiryTypes[0] ?? ""} name="inquiryType">
            {inquiryTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Location
          <select className={inputClass} defaultValue={locations[0] ?? ""} name="location">
            {locations.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Date of interest
          <input
            className={inputClass}
            name="dateOfInterest"
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={date}
          />
        </label>
        <label className={labelClass}>
          Number of guests
          <input className={inputClass} inputMode="numeric" min={1} name="numberOfGuests" type="number" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Activity interest
          <input className={inputClass} name="activityInterest" placeholder="e.g. Pass Activities, rafting, team building" type="text" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Notes from the call
          <textarea className={`${inputClass} min-h-24`} name="message" />
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="mb-2 text-sm font-semibold text-slate-950">Quick questions</legend>
        {[
          ["catering", "Catering?"],
          ["venueRental", "Venue rental?"],
          ["accommodationInterest", "Lodging interest?"],
          ["visitedPrior", "Visited before?"],
          ["dateFlexibility", "Date flexible?"],
        ].map(([name, label]) => (
          <label className={labelClass} key={name}>
            {label}
            <select className={inputClass} defaultValue="" name={name}>
              <option value="">Not asked</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-950">Handling</legend>
        <label className={labelClass}>
          Event coordinator {expedited ? <span className="text-amber-700">(required for expedited)</span> : null}
          <select className={inputClass} defaultValue="" name="coordinatorGhlUserId" required={expedited}>
            <option value="">Assign later</option>
            {planners.map((planner) => (
              <option key={planner.id} value={planner.id}>{planner.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <input
            checked={expedited}
            className="mt-0.5"
            name="expedited"
            onChange={(event) => {
              setExpeditedTouched(true);
              setExpedited(event.target.checked);
            }}
            type="checkbox"
          />
          <span>
            <span className="block font-semibold">Expedited event</span>
            <span className="block text-xs">
              Starts ticked when the date is within {EXPEDITED_WINDOW_DAYS}{" "}
              days. You&apos;ll hold rooms right after saving, the deal goes
              straight to Planning, and the contract deadline rule treats it as
              a rush.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        <p className="text-xs text-slate-500">
          Creates the GHL contact and opportunity (New Inquiry), then the draft event.
        </p>
        <button className={buttonClasses("primary", "md")} disabled={pending} type="submit">
          {pending ? "Creating…" : expedited ? "Create and hold rooms" : "Create inquiry"}
        </button>
      </div>
    </form>
  );
}
