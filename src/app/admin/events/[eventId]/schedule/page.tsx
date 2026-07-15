import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminEventById } from "@/lib/admin/events";
import { getScheduleItems } from "@/lib/admin/event-schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ScheduleBuilder } from "./schedule-builder";

type AdminSchedulePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminSchedulePage({
  params,
}: AdminSchedulePageProps) {
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

  const items = await getScheduleItems(eventId);

  return (
    <AdminShell
      description="Build the client-facing schedule as a timeline of tiles. Each tile has a title, description, and optional notes with images."
      eyebrow="Schedule & Notes"
      title={event.eventName}
      userEmail={user.email}
    >
      <Link
        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        href={`/admin/events/${eventId}`}
      >
        Back to event
      </Link>

      <ScheduleBuilder eventId={eventId} items={items} />
    </AdminShell>
  );
}
