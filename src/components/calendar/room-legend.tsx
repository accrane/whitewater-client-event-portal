import type { Room } from "@/lib/calendar/types";

interface RoomLegendProps {
  rooms: Room[];
}

export function RoomLegend({ rooms }: RoomLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white rounded-xl shadow-sm border border-slate-200">
      {rooms.map((room) => (
        <div key={room.id} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: room.color }}
          />
          <span className="text-sm text-slate-700">{room.name}</span>
          {room.capacity && (
            <span className="text-xs text-slate-400">({room.capacity})</span>
          )}
        </div>
      ))}
      <div className="border-l border-slate-200 pl-4 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-100" />
          <span className="text-xs text-slate-500">Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-45 border border-dashed border-slate-500" />
          <span className="text-xs text-slate-500">Held</span>
        </div>
      </div>
    </div>
  );
}
