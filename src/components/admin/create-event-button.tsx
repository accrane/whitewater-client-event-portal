"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ReservationModal } from "@/components/calendar/reservation-modal";
import { buttonClasses } from "@/components/ui/button";
import { api } from "@/lib/calendar/api";
import { createReservationBlocks } from "@/lib/calendar/create-blocks";
import type {
  GhlUserOption,
  PortalEventOption,
  ReservationFormData,
  Room,
} from "@/lib/calendar/types";

// The events-page counterpart of the room calendar's "Create Event" button:
// same modal, same behavior (link an event, pick rooms, book blocks). Data
// for the modal loads on demand when the button is clicked.
export function CreateEventButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [portalEvents, setPortalEvents] = useState<PortalEventOption[]>([]);
  const [ghlUsers, setGhlUsers] = useState<GhlUserOption[]>([]);

  const openModal = async () => {
    setLoading(true);
    try {
      const [roomsData, portalEventsData, ghlUsersData] = await Promise.all([
        api.rooms.list(),
        api.portalEvents.list(),
        api.ghlUsers.list(),
      ]);
      setRooms(roomsData);
      setPortalEvents(portalEventsData);
      setGhlUsers(ghlUsersData);
      setOpen(true);
    } catch (err) {
      console.error("Failed loading create-event data", err);
      alert(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMany = async (
    blocks: ReservationFormData[],
    coordinatorUserId?: string,
  ) => {
    const failures = await createReservationBlocks(blocks, coordinatorUserId);
    if (failures.length < blocks.length) {
      router.refresh();
    }
    return failures;
  };

  return (
    <>
      <button
        disabled={loading}
        onClick={openModal}
        className={buttonClasses("primary")}
        type="button"
      >
        {loading ? "Loading…" : "+ Create Event"}
      </button>

      {open && (
        <ReservationModal
          key={`events-page-${portalEvents.length}`}
          onClose={() => setOpen(false)}
          onSave={async () => {}}
          onCreateMany={handleCreateMany}
          rooms={rooms}
          ghlUsers={ghlUsers}
          portalEvents={portalEvents}
        />
      )}
    </>
  );
}
