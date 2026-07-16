import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminEventById } from "@/lib/admin/events";
import { getEventChecklistSections } from "@/lib/admin/checklist-sections";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ChecklistBuilder } from "./checklist-builder";

type AdminChecklistPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminChecklistPage({
  params,
}: AdminChecklistPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { eventId } = await params;
  const event = await getAdminEventById(eventId);

  if (!event) {
    notFound();
  }

  const sections = await getEventChecklistSections(eventId);

  return (
    <AdminShell
      description="Build the client-facing checklist as FAQ-style sections. Each section has a title clients expand for details on what they need to do."
      eyebrow="Checklist"
      title={event.eventName}
      userEmail={user.email}
    >
      <Link
        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        href={`/admin/events/${eventId}`}
      >
        Back to event
      </Link>

      <ChecklistBuilder eventId={eventId} sections={sections} />
    </AdminShell>
  );
}
