import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import type { Room, Reservation } from "@/lib/calendar/types";
import {
  HOUR_HEIGHT,
  START_HOUR,
  END_HOUR,
  TOTAL_HOURS,
  getWeekDays,
  formatDayHeader,
  isToday,
  roundToNearest15,
  formatTime,
} from "@/lib/calendar/utils";
import {
  format,
  isSameDay,
  setHours,
  setMinutes,
  addMinutes,
  differenceInMinutes,
} from "date-fns";
import { ReservationBlock, type DragType } from "./reservation-block";

type Column = { day: Date; room: Room; key: string };

interface DragState {
  reservation: Reservation;
  type: DragType;
  /** Y position where the mouse first triggered the drag */
  originY: number;
  /** Original block top in px within its column */
  blockTop: number;
  /** Original block height in px */
  blockHeight: number;
  /** Column index the reservation originated from */
  originColIndex: number;
}

interface DragPreview {
  colIndex: number;
  top: number;
  height: number;
  startTime: Date;
  endTime: Date;
}

interface CalendarGridProps {
  currentDate: Date;
  viewMode: "week" | "day";
  rooms: Room[];
  reservations: Reservation[];
  selectedRoomId: string | null;
  onSlotClick: (roomId: string, date: Date, startTime: Date) => void;
  onReservationClick: (reservation: Reservation) => void;
  onReservationDrop: (
    reservationId: string,
    update: { room_id: string; start_datetime: string; end_datetime: string },
  ) => void;
}

export function CalendarGrid({
  currentDate,
  viewMode,
  rooms,
  reservations,
  selectedRoomId,
  onSlotClick,
  onReservationClick,
  onReservationDrop,
}: CalendarGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columnsAreaRef = useRef<HTMLDivElement>(null);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  // Latest preview, readable from the mouseup handler without re-binding it
  const dragPreviewRef = useRef<DragPreview | null>(null);

  const days = useMemo(
    () => (viewMode === "week" ? getWeekDays(currentDate) : [currentDate]),
    [viewMode, currentDate],
  );
  const displayRooms = useMemo(
    () =>
      selectedRoomId ? rooms.filter((r) => r.id === selectedRoomId) : rooms,
    [selectedRoomId, rooms],
  );
  const hours = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => START_HOUR + i,
  );
  const totalHeight = hours.length * HOUR_HEIGHT;

  const isSingleRoom = displayRooms.length === 1;

  // Build columns and day group headers
  const { columns, dayGroups } = useMemo(() => {
    const cols: Column[] = [];
    const groups: { day: Date; count: number }[] = [];
    const singleRoom = displayRooms.length === 1;

    if (singleRoom) {
      for (const day of days) {
        cols.push({
          day,
          room: displayRooms[0],
          key: `${day.toISOString()}-${displayRooms[0].id}`,
        });
      }
    } else if (viewMode === "day") {
      for (const room of displayRooms) {
        cols.push({
          day: days[0],
          room,
          key: `${days[0].toISOString()}-${room.id}`,
        });
      }
    } else {
      for (const day of days) {
        for (const room of displayRooms) {
          cols.push({ day, room, key: `${day.toISOString()}-${room.id}` });
        }
      }
    }

    if (!singleRoom && viewMode === "week") {
      for (const day of days) {
        groups.push({ day, count: displayRooms.length });
      }
    }

    return { columns: cols, dayGroups: groups };
  }, [days, displayRooms, viewMode]);

  // Find column index for a reservation
  const findColumnIndex = useCallback(
    (roomId: string, startDatetime: string) => {
      const startDate = new Date(startDatetime);
      return columns.findIndex(
        (c) => c.room.id === roomId && isSameDay(c.day, startDate),
      );
    },
    [columns],
  );

  const getReservationsForCell = useCallback(
    (roomId: string, day: Date) => {
      return reservations.filter((r) => {
        if (r.room_id !== roomId) return false;
        return isSameDay(new Date(r.start_datetime), day);
      });
    },
    [reservations],
  );

  // Convert a pixel Y offset within a column to a time (snapped to 15min)
  const yToTime = useCallback((y: number, day: Date): Date => {
    const minutesFromGridStart = (y / HOUR_HEIGHT) * 60;
    const clampedMinutes = Math.max(
      0,
      Math.min(minutesFromGridStart, TOTAL_HOURS * 60),
    );
    const snapped = Math.round(clampedMinutes / 15) * 15;
    const hour = START_HOUR + Math.floor(snapped / 60);
    const mins = snapped % 60;
    return setMinutes(setHours(new Date(day), hour), mins);
  }, []);

  // Get column element bounding rects for hit-testing
  const getColumnRects = useCallback(() => {
    const area = columnsAreaRef.current;
    if (!area) return [];
    const children = Array.from(area.children) as HTMLElement[];
    return children.map((el) => el.getBoundingClientRect());
  }, []);

  // Resolve which column the cursor is over
  const hitTestColumn = useCallback(
    (clientX: number): number => {
      const rects = getColumnRects();
      for (let i = 0; i < rects.length; i++) {
        if (clientX >= rects[i].left && clientX < rects[i].right) return i;
      }
      // Fallback: closest
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < rects.length; i++) {
        const center = (rects[i].left + rects[i].right) / 2;
        const dist = Math.abs(clientX - center);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      return closest;
    },
    [getColumnRects],
  );

  // Convert clientY to Y within the grid (accounting for scroll)
  const clientYToGridY = useCallback((clientY: number): number => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    return clientY - rect.top + grid.scrollTop;
  }, []);

  // --- Drag handlers ---
  const handleDragStart = useCallback(
    (
      reservation: Reservation,
      type: DragType,
      startY: number,
      blockTop: number,
      blockHeight: number,
    ) => {
      const colIndex = findColumnIndex(
        reservation.room_id,
        reservation.start_datetime,
      );
      if (colIndex === -1) return;

      const state: DragState = {
        reservation,
        type,
        originY: startY,
        blockTop,
        blockHeight,
        originColIndex: colIndex,
      };
      dragStateRef.current = state;
      setDragState(state);
    },
    [findColumnIndex],
  );

  useEffect(() => {
    if (!dragState) return;

    const ds = dragState;
    const durationMinutes = differenceInMinutes(
      new Date(ds.reservation.end_datetime),
      new Date(ds.reservation.start_datetime),
    );

    const updatePreview = (preview: DragPreview) => {
      dragPreviewRef.current = preview;
      setDragPreview(preview);
    };

    const onMouseMove = (e: MouseEvent) => {
      const gridY = clientYToGridY(e.clientY);
      const colIndex = hitTestColumn(e.clientX);
      const col = columns[colIndex];
      if (!col) return;

      if (ds.type === "move") {
        // Shift the block by the mouse delta
        const deltaY = e.clientY - ds.originY;
        let newTop = ds.blockTop + deltaY;
        // Clamp
        const maxTop = totalHeight - ds.blockHeight;
        newTop = Math.max(0, Math.min(newTop, maxTop));
        // Snap to 15-min grid
        const startTime = yToTime(newTop, col.day);
        const endTime = addMinutes(startTime, durationMinutes);
        const snappedTop =
          (((startTime.getHours() - START_HOUR) * 60 +
            startTime.getMinutes()) /
            60) *
          HOUR_HEIGHT;

        updatePreview({
          colIndex,
          top: snappedTop,
          height: ds.blockHeight,
          startTime,
          endTime,
        });
      } else {
        // Resize: keep start fixed, change end
        const startTime = new Date(ds.reservation.start_datetime);
        const newEndTime = yToTime(gridY, col.day);
        // Must be at least 15 min
        if (differenceInMinutes(newEndTime, startTime) < 15) return;
        const endMinutes =
          (newEndTime.getHours() - START_HOUR) * 60 + newEndTime.getMinutes();
        const startMinutes =
          (startTime.getHours() - START_HOUR) * 60 + startTime.getMinutes();
        const newHeight = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;

        updatePreview({
          colIndex: ds.originColIndex,
          top: ds.blockTop,
          height: Math.max(newHeight, 15),
          startTime,
          endTime: newEndTime,
        });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      // Commit the drop at its final preview position
      const preview = dragPreviewRef.current;
      if (preview) {
        const col = columns[preview.colIndex];
        if (col) {
          onReservationDrop(ds.reservation.id, {
            room_id: col.room.id,
            start_datetime: preview.startTime.toISOString(),
            end_datetime: preview.endTime.toISOString(),
          });
        }
      }
      dragPreviewRef.current = null;
      setDragState(null);
      setDragPreview(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [
    dragState,
    columns,
    totalHeight,
    hitTestColumn,
    clientYToGridY,
    yToTime,
    onReservationDrop,
  ]);

  const handleSlotClick = useCallback(
    (roomId: string, day: Date, e: React.MouseEvent<HTMLDivElement>) => {
      // Don't open modal if we just finished a drag
      if (dragStateRef.current) {
        dragStateRef.current = null;
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const hourOffset = y / HOUR_HEIGHT;
      const hour = START_HOUR + Math.floor(hourOffset);
      const minutes = Math.round(((hourOffset % 1) * 60) / 15) * 15;

      const startTime = setMinutes(setHours(new Date(day), hour), minutes);
      onSlotClick(roomId, day, roundToNearest15(startTime));
    },
    [onSlotClick],
  );

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
      style={{ minHeight: 0 }}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200">
        {dayGroups.length > 0 && (
          <div className="flex" style={{ marginLeft: "56px" }}>
            {dayGroups.map(({ day }) => (
              <div
                key={day.toISOString()}
                className={`flex-1 text-center border-r border-slate-200 last:border-r-0 py-1.5 text-xs font-semibold ${
                  isToday(day) ? "bg-blue-50 text-blue-700" : "text-slate-600"
                }`}
                style={{ minWidth: 0 }}
              >
                {formatDayHeader(day)}
              </div>
            ))}
          </div>
        )}

        <div className="flex" style={{ marginLeft: "56px" }}>
          {columns.map((col) => {
            const showDayLabel = dayGroups.length === 0;
            return (
              <div
                key={col.key}
                className={`flex-1 text-center border-r border-slate-100 last:border-r-0 py-1.5 px-1 ${
                  isToday(col.day) && dayGroups.length === 0 ? "bg-blue-50" : ""
                }`}
                style={{ minWidth: 0 }}
              >
                {showDayLabel && (
                  <div
                    className={`text-xs font-semibold ${isToday(col.day) ? "text-blue-700" : "text-slate-600"}`}
                  >
                    {isSingleRoom
                      ? formatDayHeader(col.day)
                      : format(col.day, "EEE M/d")}
                  </div>
                )}
                {!isSingleRoom && (
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <div
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: col.room.color }}
                    />
                    <span className="text-[10px] text-slate-500 truncate">
                      {col.room.name}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable grid area */}
      <div
        ref={gridRef}
        className="flex-1 overflow-auto calendar-grid"
        style={{ minHeight: 0 }}
      >
        <div className="flex" style={{ height: `${totalHeight}px` }}>
          {/* Time gutter */}
          <div className="flex-shrink-0 w-14 border-r border-slate-200 relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-end pr-2"
                style={{
                  top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`,
                  height: `${HOUR_HEIGHT}px`,
                }}
              >
                <span className="text-[10px] text-slate-400 -mt-1.5">
                  {format(setHours(new Date(), hour), "h a")}
                </span>
              </div>
            ))}
          </div>

          {/* Columns */}
          <div ref={columnsAreaRef} className="flex-1 flex">
            {columns.map((col, colIndex) => (
              <div
                key={col.key}
                className="flex-1 relative border-r border-slate-100 last:border-r-0 cursor-pointer"
                style={{ minWidth: 0 }}
                onClick={(e) => handleSlotClick(col.room.id, col.day, e)}
              >
                {/* Hour grid lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}
                {/* Half-hour lines */}
                {hours.map((hour) => (
                  <div
                    key={`${hour}-half`}
                    className="absolute left-0 right-0 border-t border-slate-50"
                    style={{
                      top: `${(hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px`,
                    }}
                  />
                ))}

                {/* Current time indicator (dot only on the day's first column so it reads as one line) */}
                {isToday(col.day) &&
                  (() => {
                    const now = new Date();
                    const minutesFromStart =
                      (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                    if (
                      minutesFromStart < 0 ||
                      minutesFromStart > (END_HOUR - START_HOUR) * 60
                    )
                      return null;
                    const top = (minutesFromStart / 60) * HOUR_HEIGHT;
                    const isFirstColOfDay =
                      colIndex === 0 ||
                      !isSameDay(columns[colIndex - 1].day, col.day);
                    const isLastColOfDay =
                      colIndex === columns.length - 1 ||
                      !isSameDay(columns[colIndex + 1].day, col.day);
                    return (
                      <div
                        className="absolute z-20 pointer-events-none"
                        style={{
                          top: `${top}px`,
                          left: 0,
                          right: isLastColOfDay ? 0 : "-1px",
                        }}
                      >
                        <div className="h-0.5 bg-red-500 relative">
                          {isFirstColOfDay && (
                            <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* Reservation blocks */}
                {getReservationsForCell(col.room.id, col.day).map(
                  (reservation) => (
                    <ReservationBlock
                      key={reservation.id}
                      reservation={reservation}
                      room={col.room}
                      onClick={onReservationClick}
                      onDragStart={handleDragStart}
                    />
                  ),
                )}

                {/* Drag preview ghost */}
                {dragPreview && dragPreview.colIndex === colIndex && (
                  <div
                    className="absolute left-0.5 right-0.5 rounded-md border-2 border-blue-500 bg-blue-200/40 z-30 pointer-events-none flex flex-col items-center justify-center"
                    style={{
                      top: `${dragPreview.top}px`,
                      height: `${dragPreview.height}px`,
                    }}
                  >
                    <span className="text-[10px] font-semibold text-blue-700">
                      {formatTime(dragPreview.startTime)} –{" "}
                      {formatTime(dragPreview.endTime)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full-screen drag overlay to prevent text selection and capture all mouse events */}
      {dragState && (
        <div
          className="fixed inset-0 z-40 cursor-grabbing"
          style={{ background: "transparent" }}
        />
      )}
    </div>
  );
}
