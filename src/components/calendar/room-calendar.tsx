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
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarGrid } from "./calendar-grid";
import { ReservationModal } from "./reservation-modal";
import { SettingsModal } from "./settings-modal";
import { RoomLegend } from "./room-legend";

export function RoomCalendar() {
  const {
    rooms,
    reservations,
    coordinators,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Assigns the chosen coordinator to the event's GHL opportunity. Outcomes
  // are logged server-side; a GHL failure must not fail the reservation save.
  const assignCoordinator = useCallback(
    async (eventId: string | null | undefined, ghlUserId?: string) => {
      if (!eventId || !ghlUserId) return;
      try {
        await api.coordinatorAssignment.set(eventId, ghlUserId);
      } catch (err) {
        console.error("Coordinator assignment failed", err);
      }
    },
    [],
  );

  const handleSave = useCallback(
    async (data: ReservationFormData, coordinatorUserId?: string) => {
      if (!editingReservation) return;
      await api.reservations.update(editingReservation.id, data);
      await assignCoordinator(data.event_id, coordinatorUserId);
      await refetch();
    },
    [editingReservation, assignCoordinator, refetch],
  );

  // Creates one reservation per room block, returning the blocks that failed
  // (e.g. conflicts) so the modal can keep them open for correction.
  const handleCreateMany = useCallback(
    async (blocks: ReservationFormData[], coordinatorUserId?: string) => {
      const failures: { index: number; message: string }[] = [];
      for (const [index, block] of blocks.entries()) {
        try {
          await api.reservations.create(block);
        } catch (err) {
          failures.push({
            index,
            message: err instanceof Error ? err.message : "Failed to save",
          });
        }
      }
      if (failures.length < blocks.length) {
        await assignCoordinator(blocks[0]?.event_id, coordinatorUserId);
      }
      await refetch();
      return failures;
    },
    [assignCoordinator, refetch],
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
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          title="Settings"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
        <button
          onClick={() => {
            setEditingReservation(null);
            setDefaultRoomId(undefined);
            setDefaultStart(new Date());
            setModalOpen(true);
          }}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          + New Reservation
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

      {/* Settings */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        coordinators={coordinators}
        onChanged={refetch}
      />
    </div>
  );
}
