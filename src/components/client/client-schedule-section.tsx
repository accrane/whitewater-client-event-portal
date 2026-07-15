import { ClientSectionCard } from "./client-section-card";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import type { ScheduleBlock, ScheduleGroup } from "@/lib/schedule";

type ClientScheduleSectionProps = {
  groups: ScheduleGroup[];
  blocks: ScheduleBlock[];
};

export function ClientScheduleSection({
  groups,
  blocks,
}: ClientScheduleSectionProps) {
  if (blocks.length === 0) {
    return (
      <ClientSectionCard
        description="Your planner has not published a day schedule yet."
        title="Schedule"
      >
        <p className="text-sm text-slate-600">
          Check back soon — your event-day timeline will appear here.
        </p>
      </ClientSectionCard>
    );
  }

  return (
    <ClientSectionCard
      description="Your event-day timeline. Times and activities may be adjusted by your planner."
      title="Schedule"
    >
      <ScheduleGrid blocks={blocks} groups={groups} />
    </ClientSectionCard>
  );
}
