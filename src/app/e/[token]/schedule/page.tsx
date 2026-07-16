import Link from "next/link";

import { ClientHero } from "@/components/client/client-hero";
import { ClientPortalNav } from "@/components/client/client-portal-nav";
import { ClientScheduleSection } from "@/components/client/client-schedule-section";
import { NoteTiles } from "@/components/schedule/note-tiles";
import {
  getEventScheduleData,
  getScheduleItems,
} from "@/lib/admin/event-schedule";
import { getClientPortalEventByToken } from "@/lib/client/portal";
import { formatDisplayDate } from "@/lib/dates";

type ClientSchedulePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ClientSchedulePage({ params }: ClientSchedulePageProps) {
  const { token } = await params;
  const event = await getClientPortalEventByToken(token);

  if (!event) {
    return <InvalidOrUnavailableSchedule token={token} />;
  }

  const [schedule, items] = await Promise.all([
    getEventScheduleData(event.id),
    getScheduleItems(event.id),
  ]);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <ClientPortalNav active="schedule" token={token} />

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <ClientHero
            description="Standalone schedule view for quick event-day reference."
            eyebrow="Event Schedule"
            title={event.eventName}
          />

          <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
            <SummaryItem label="Event date" value={formatNullableDate(event.eventDate)} />
            <SummaryItem label="Arrival time" value={event.arrivalTime || "Not set"} />
            <SummaryItem
              label="Meeting location"
              value={event.meetingLocation || "Not set"}
            />
          </div>
        </section>

        <ClientScheduleSection
          blocks={schedule.blocks}
          groups={schedule.groups}
          items={items}
        />

        <NoteTiles notes={schedule.notes} />
      </div>
    </main>
  );
}

function InvalidOrUnavailableSchedule({ token }: { token: string }) {
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-6 sm:px-8">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <ClientHero
          description="Schedule access remains locked until the planner launches the client portal."
          eyebrow="Event Schedule"
          title="This schedule link is not active yet."
        />

        <div className="space-y-5 p-6 sm:p-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Schedule token</p>
            <p className="mt-1 break-all font-mono text-sm text-slate-800">
              {token}
            </p>
          </div>

          <Link
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            href="/"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatNullableDate(date: string | null): string {
  return date ? formatDisplayDate(date) : "Not set";
}
