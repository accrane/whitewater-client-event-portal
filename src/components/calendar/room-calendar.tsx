"use client";

import { useState, useCallback } from "react";
import type {
  Reservation,
  ReservationFormData,
  ViewMode,
} from "@/lib/calendar/types";
import { useCalendarData } from "@/lib/calendar/use-calendar-data";
import { nextWeek, prevWeek, nextDay, prevDay } from "@/lib/calendar/utils";
import { api } from "@/lib/calendar/api";
import { createReservationBlocks } from "@/lib/calendar/create-blocks";
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarGrid } from "./calendar-grid";
import { ReservationModal } from "./reservation-modal";
import { RoomLegend } from "./room-legend";

export function RoomCalendar() {
  const {
    rooms,
    reservations,
    portalEvents,
    ghlUsers,
    loading,
    error,
    calendarState,
    setCalendarState,
    refetch,
  } = useCalendarData();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [defaultRoomId, setDefaultRoomId] = useState<string | undefined>();
  const [defaultStart, setDefaultStart] = useState<Date | undefined>();

  const handleNavigate = useCallback(
    (direction: "prev" | "next" | "today") => {
      setCalendarState((prev) => {
        if (direction === "today") return { ...prev, currentDate: new Date() };
        const nav =
          prev.viewMode === "week"
            ? direction === "next"
              ? nextWeek
              : prevWeek
            : direction === "next"
              ? nextDay
              : prevDay;
        return { ...prev, currentDate: nav(prev.currentDate) };
      });
    },
    [setCalendarState],
  );

  const handleViewChange = useCallback(
    (view: ViewMode) => {
      setCalendarState((prev) => ({ ...prev, viewMode: view }));
    },
    [setCalendarState],
  );

  const handleRoomFilter = useCallback(
    (roomId: string | null) => {
      setCalendarState((prev) => ({ ...prev, selectedRoomId: roomId }));
    },
    [setCalendarState],
  );

  const handleStatusFilter = useCallback(
    (status: "all" | "held" | "booked") => {
      setCalendarState((prev) => ({ ...prev, statusFilter: status }));
    },
    [setCalendarState],
  );

  const handleSlotClick = useCallback(
    (roomId: string, _day: Date, startTime: Date) => {
      setEditingReservation(null);
      setDefaultRoomId(roomId);
      setDefaultStart(startTime);
      setModalOpen(true);
    },
    [],
  );

  const handleReservationClick = useCallback((reservation: Reservation) => {
    setEditingReservation(reservation);
    setDefaultRoomId(undefined);
    setDefaultStart(undefined);
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(
    async (data: ReservationFormData, coordinatorUserId?: string) => {
      if (!editingReservation) return;
      await api.reservations.update(editingReservation.id, data);
      if (data.event_id && coordinatorUserId) {
        // Outcome is logged server-side; a GHL hiccup must not fail the save.
        try {
          await api.coordinatorAssignment.set(data.event_id, coordinatorUserId);
        } catch (err) {
          console.error("Coordinator assignment failed", err);
        }
      }
      await refetch();
    },
    [editingReservation, refetch],
  );

  const handleCreateMany = useCallback(
    async (blocks: ReservationFormData[], coordinatorUserId?: string) => {
      const failures = await createReservationBlocks(blocks, coordinatorUserId);
      await refetch();
      return failures;
    },
    [refetch],
  );

  const handleDelete = useCallback(async () => {
    if (!editingReservation) return;
    await api.reservations.delete(editingReservation.id);
    await refetch();
  }, [editingReservation, refetch]);

  const handleReservationDrop = useCallback(
    async (
      reservationId: string,
      update: {
        room_id: string;
        start_datetime: string;
        end_datetime: string;
      },
    ) => {
      try {
        await api.reservations.update(reservationId, update);
        await refetch();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to move reservation");
        await refetch();
      }
    },
    [refetch],
  );

  return (
    <div className="flex h-[75vh] min-h-[520px] flex-col gap-3">
      {/* Actions */}
      <div className="flex-shrink-0 flex items-center justify-end gap-2">
        <button
          onClick={() => {
            setEditingReservation(null);
            setDefaultRoomId(undefined);
            setDefaultStart(new Date());
            setModalOpen(true);
          }}
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="button"
        >
          + Create Event
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0">
        <CalendarToolbar
          calendarState={calendarState}
          rooms={rooms}
          onNavigate={handleNavigate}
          onViewChange={handleViewChange}
          onRoomFilter={handleRoomFilter}
          onStatusFilter={handleStatusFilter}
        />
      </div>

      {/* Legend */}
      <div className="flex-shrink-0">
        <RoomLegend rooms={rooms} />
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-400">Loading...</div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
              <button onClick={refetch} className="ml-2 underline">
                Retry
              </button>
            </div>
          </div>
        )}
        {!loading && !error && (
          <CalendarGrid
            currentDate={calendarState.currentDate}
            viewMode={calendarState.viewMode}
            rooms={rooms}
            reservations={reservations}
            selectedRoomId={calendarState.selectedRoomId}
            onSlotClick={handleSlotClick}
            onReservationClick={handleReservationClick}
            onReservationDrop={handleReservationDrop}
          />
        )}
      </div>

      {/* Modal (keyed so each open remounts with fresh form state) */}
      {modalOpen && (
        <ReservationModal
          key={
            editingReservation
              ? editingReservation.id
              : `new-${defaultRoomId ?? "none"}-${defaultStart?.getTime() ?? 0}`
          }
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateMany={handleCreateMany}
          onDelete={editingReservation ? handleDelete : undefined}
          rooms={rooms}
          ghlUsers={ghlUsers}
          portalEvents={portalEvents}
          reservation={editingReservation}
          defaultRoomId={defaultRoomId}
          defaultStart={defaultStart}
        />
      )}
    </div>
  );
}
