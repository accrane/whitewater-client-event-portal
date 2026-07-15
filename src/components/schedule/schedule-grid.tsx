import {
  BLOCK_COLORS,
  SLOT_MINUTES,
  formatScheduleRange,
  formatScheduleTime,
  type ScheduleBlock,
  type ScheduleGroup,
} from "@/lib/schedule";

const ROW_HEIGHT = 26; // px per 15-minute slot
const DEFAULT_START = 630; // 10:30am
const DEFAULT_END = 1080; // 6:00pm

type ScheduleGridProps = {
  groups: ScheduleGroup[];
  blocks: ScheduleBlock[];
};

export function ScheduleGrid({ groups, blocks }: ScheduleGridProps) {
  const gridStart = blocks.length
    ? roundDown(Math.min(...blocks.map((b) => b.start_minutes)))
    : DEFAULT_START;
  const gridEnd = blocks.length
    ? roundUp(Math.max(...blocks.map((b) => b.end_minutes)))
    : DEFAULT_END;

  const slotCount = Math.max(1, (gridEnd - gridStart) / SLOT_MINUTES);
  const slots = Array.from(
    { length: slotCount },
    (_, i) => gridStart + i * SLOT_MINUTES,
  );
  const totalHeight = slotCount * ROW_HEIGHT;

  // With no groups defined, everything renders in one full-width column.
  const columnCount = Math.max(1, groups.length);
  const groupIndex = new Map(groups.map((group, index) => [group.id, index]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px] overflow-hidden rounded-xl border border-slate-300 bg-white">
        {/* Group headers */}
        <div className="flex border-b border-slate-300 bg-slate-50">
          <div className="w-20 shrink-0 border-r border-slate-300" />
          {(groups.length ? groups : [null]).map((group, index) => (
            <div
              className="flex-1 border-r border-slate-200 px-2 py-2 text-center text-sm font-semibold text-slate-800 last:border-r-0"
              key={group?.id ?? index}
            >
              {group
                ? `${group.name}${group.size ? ` (${group.size})` : ""}`
                : "Schedule"}
            </div>
          ))}
        </div>

        <div className="flex">
          {/* Time gutter */}
          <div
            className="relative w-20 shrink-0 border-r border-slate-300"
            style={{ height: `${totalHeight}px` }}
          >
            {slots.map((minutes) => (
              <div
                className="absolute right-0 left-0 flex items-center justify-end border-t border-slate-100 pr-2 first:border-t-0"
                key={minutes}
                style={{
                  top: `${((minutes - gridStart) / SLOT_MINUTES) * ROW_HEIGHT}px`,
                  height: `${ROW_HEIGHT}px`,
                }}
              >
                <span className="text-[11px] font-semibold text-slate-600">
                  {formatScheduleTime(minutes)}
                </span>
              </div>
            ))}
          </div>

          {/* Blocks area */}
          <div className="relative flex-1" style={{ height: `${totalHeight}px` }}>
            {/* Slot lines */}
            {slots.map((minutes) => (
              <div
                className="absolute right-0 left-0 border-t border-slate-100 first:border-t-0"
                key={minutes}
                style={{
                  top: `${((minutes - gridStart) / SLOT_MINUTES) * ROW_HEIGHT}px`,
                }}
              />
            ))}
            {/* Column separators */}
            {columnCount > 1 &&
              Array.from({ length: columnCount - 1 }, (_, i) => (
                <div
                  className="absolute top-0 bottom-0 border-r border-slate-200"
                  key={i}
                  style={{ left: `${((i + 1) / columnCount) * 100}%` }}
                />
              ))}

            {blocks.map((block) => {
              const top =
                ((block.start_minutes - gridStart) / SLOT_MINUTES) * ROW_HEIGHT;
              const height =
                ((block.end_minutes - block.start_minutes) / SLOT_MINUTES) *
                ROW_HEIGHT;
              const index = block.group_id
                ? groupIndex.get(block.group_id)
                : undefined;
              const spansAll = block.group_id === null || index === undefined;
              const left = spansAll ? 0 : (index / columnCount) * 100;
              const width = spansAll ? 100 : (1 / columnCount) * 100;
              const showTimes =
                block.end_minutes - block.start_minutes >= SLOT_MINUTES * 3;

              return (
                <div
                  className="absolute flex flex-col items-center justify-center overflow-hidden border border-slate-400 px-2 text-center"
                  key={block.id}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: BLOCK_COLORS[block.color].background,
                  }}
                  title={`${block.label} (${formatScheduleRange(block.start_minutes, block.end_minutes)})`}
                >
                  <span className="text-sm font-medium leading-tight text-slate-900">
                    {block.label}
                  </span>
                  {showTimes && (
                    <span className="text-xs leading-tight text-slate-700">
                      {formatScheduleRange(
                        block.start_minutes,
                        block.end_minutes,
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function roundDown(minutes: number): number {
  return Math.floor(minutes / 30) * 30;
}

function roundUp(minutes: number): number {
  return Math.ceil(minutes / 30) * 30;
}
