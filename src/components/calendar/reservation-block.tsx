import { useRef, useCallback } from "react";
import type { Reservation, Room } from "@/lib/calendar/types";
import { formatTime, getBlockPosition } from "@/lib/calendar/utils";

export type DragType = "move" | "resize";

interface ReservationBlockProps {
  reservation: Reservation;
  room: Room;
  onClick: (reservation: Reservation) => void;
  onDragStart: (
    reservation: Reservation,
    type: DragType,
    startY: number,
    blockTop: number,
    blockHeight: number,
  ) => void;
}

export function ReservationBlock({
  reservation,
  room,
  onClick,
  onDragStart,
}: ReservationBlockProps) {
  const { top, height } = getBlockPosition(
    reservation.start_datetime,
    reservation.end_datetime,
  );
  const isHeld = reservation.status === "held";
  const isCompact = height < 50;
  const didDragRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: DragType) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

      const DRAG_THRESHOLD = 4;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - mouseDownPosRef.current.x;
        const dy = moveEvent.clientY - mouseDownPosRef.current.y;
        if (
          !didDragRef.current &&
          Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD
        ) {
          didDragRef.current = true;
          onDragStart(reservation, type, mouseDownPosRef.current.y, top, height);
        }
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [reservation, onDragStart, top, height],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!didDragRef.current) {
        onClick(reservation);
      }
    },
    [onClick, reservation],
  );

  return (
    <div
      className="absolute left-0.5 right-0.5 rounded-md px-2 py-1 text-left cursor-grab overflow-hidden transition-shadow hover:shadow-md z-10 group select-none"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: room.color,
        opacity: isHeld ? 0.45 : 1,
        borderWidth: "2px",
        borderStyle: isHeld ? "dashed" : "solid",
        borderColor: isHeld ? room.color : "transparent",
      }}
      title={`${reservation.title} (${reservation.status})\n${formatTime(reservation.start_datetime)} – ${formatTime(reservation.end_datetime)}${reservation.coordinator_name ? `\nEC: ${reservation.coordinator_name}` : ""}`}
      onMouseDown={(e) => handleMouseDown(e, "move")}
      onClick={handleClick}
    >
      <div
        className="text-white text-xs font-semibold truncate leading-tight pointer-events-none"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
      >
        {reservation.title}
      </div>
      {!isCompact && (
        <>
          <div className="text-white/80 text-[10px] leading-tight truncate pointer-events-none">
            {formatTime(reservation.start_datetime)} –{" "}
            {formatTime(reservation.end_datetime)}
          </div>
          {reservation.coordinator_name && (
            <div className="text-white/90 text-[10px] font-medium leading-tight truncate pointer-events-none">
              EC: {reservation.coordinator_name}
            </div>
          )}
          {reservation.client_name && (
            <div className="text-white/70 text-[10px] leading-tight truncate pointer-events-none">
              {reservation.client_name}
            </div>
          )}
        </>
      )}
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2.5 cursor-s-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-b-md"
        onMouseDown={(e) => {
          e.stopPropagation();
          handleMouseDown(e, "resize");
        }}
      />
    </div>
  );
}
