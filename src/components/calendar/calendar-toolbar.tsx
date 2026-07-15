import type { Room, CalendarState, ViewMode } from "@/lib/calendar/types";
import { format } from "date-fns";
import { getWeekRange, formatDateRange } from "@/lib/calendar/utils";

interface CalendarToolbarProps {
  calendarState: CalendarState;
  rooms: Room[];
  onNavigate: (direction: "prev" | "next" | "today") => void;
  onViewChange: (view: ViewMode) => void;
  onRoomFilter: (roomId: string | null) => void;
  onStatusFilter: (status: "all" | "held" | "booked") => void;
}

export function CalendarToolbar({
  calendarState,
  rooms,
  onNavigate,
  onViewChange,
  onRoomFilter,
  onStatusFilter,
}: CalendarToolbarProps) {
  const { currentDate, viewMode, selectedRoomId, statusFilter } = calendarState;

  const dateLabel =
    viewMode === "week"
      ? formatDateRange(
          getWeekRange(currentDate).start,
          getWeekRange(currentDate).end,
        )
      : format(currentDate, "EEEE, MMMM d, yyyy");

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Left: Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate("prev")}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          title={viewMode === "week" ? "Previous week" : "Previous day"}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          onClick={() => onNavigate("today")}
          className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-slate-100 text-slate-700 transition-colors border border-slate-200"
        >
          Today
        </button>
        <button
          onClick={() => onNavigate("next")}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          title={viewMode === "week" ? "Next week" : "Next day"}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
        <h2 className="ml-2 text-base font-semibold text-slate-800">
          {dateLabel}
        </h2>
      </div>

      {/* Right: Filters and view toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Room filter */}
        <select
          value={selectedRoomId || ""}
          onChange={(e) => onRoomFilter(e.target.value || null)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Rooms</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) =>
            onStatusFilter(e.target.value as "all" | "held" | "booked")
          }
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="held">Held</option>
          <option value="booked">Booked</option>
        </select>

        {/* View toggle */}
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => onViewChange("day")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === "day"
                ? "bg-white text-slate-800 shadow-sm font-medium"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => onViewChange("week")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === "week"
                ? "bg-white text-slate-800 shadow-sm font-medium"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Week
          </button>
        </div>
      </div>
    </div>
  );
}
