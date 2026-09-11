import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { buttonClasses } from "@/components/ui/button";
import { listGhlPlannerUsers } from "@/lib/ghl/location-data";
import {
  fetchInquiryFieldOptions,
  listOpportunitiesWithoutPortalEvent,
} from "@/lib/ghl/phone-inquiries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { backfillInquiryEventAction } from "./actions";
import { PhoneInquiryForm } from "./phone-inquiry-form";

// Inquiries that didn't come through the website form: a phone intake (with
// the expedited fast track) and a backfill list for GHL opportunities that
// have no portal event yet — inquiries entered straight into GHL, or
// webhook deliveries that never arrived.

export default async function NewInquiryPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [planners, options, missing] = await Promise.all([
    listGhlPlannerUsers(),
    fetchInquiryFieldOptions(),
    listOpportunitiesWithoutPortalEvent(),
  ]);

  return (
    <AdminShell
      backHref="/admin/opportunities"
      backLabel="Opportunities"
      description="Take an inquiry by phone, or create the draft event for a GHL opportunity the portal hasn't seen. Website inquiries still arrive on their own."
      title="New inquiry"
      userEmail={user.email}
    >
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-950">Phone inquiry</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          The same questions as the website form. Saving creates the contact and
          opportunity in GoHighLevel and the draft event here, and leaves a note on
          the contact saying who took the call.
        </p>
        <div className="mt-5">
          <PhoneInquiryForm
            inquiryTypes={options.inquiryTypes}
            locations={options.locations}
            planners={planners.map((planner) => ({ id: planner.id, name: planner.name }))}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            GHL opportunities without a portal event
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Open opportunities in the pipeline that never reached the portal —
            entered straight into GHL, or a webhook that didn&apos;t arrive. Creating
            the draft event here is the same as if the webhook had fired.
          </p>
        </div>
        {missing.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Every open opportunity has a portal event.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {missing.map((opportunity) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                key={opportunity.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950">
                    {opportunity.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[
                      opportunity.contactName,
                      opportunity.stageName,
                      opportunity.eventDate ? `event ${opportunity.eventDate}` : null,
                      opportunity.createdAt
                        ? `inquired ${opportunity.createdAt.slice(0, 10)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <form action={backfillInquiryEventAction}>
                  <input name="opportunityId" type="hidden" value={opportunity.id} />
                  <button className={buttonClasses("secondary", "sm")} type="submit">
                    Create draft event
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Looking for the room calendar instead?{" "}
        <Link className="font-semibold underline-offset-2 hover:underline" href="/admin/calendar">
          Reserve rooms for an existing event
        </Link>
        .
      </p>
    </AdminShell>
  );
}
