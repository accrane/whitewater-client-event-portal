import { ClientSectionCard } from "./client-section-card";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { ScheduleTimeline } from "@/components/schedule/schedule-timeline";
import type {
  ScheduleBlock,
  ScheduleGroup,
  ScheduleItem,
} from "@/lib/schedule";

type ClientScheduleSectionProps = {
  groups: ScheduleGroup[];
  blocks: ScheduleBlock[];
  items: ScheduleItem[];
};

// The planner's schedule builder produces timeline items (tiles); the older
// grid of timed blocks remains as a fallback for events built before tiles.
export function ClientScheduleSection({
  groups,
  blocks,
  items,
}: ClientScheduleSectionProps) {
  if (items.length === 0 && blocks.length === 0) {
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
      {items.length > 0 ? (
        <ScheduleTimeline items={items} />
      ) : (
        <ScheduleGrid blocks={blocks} groups={groups} />
      )}
    </ClientSectionCard>
  );
}
