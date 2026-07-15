import { api } from "./api";
import type { ReservationFormData } from "./types";

export type BlockFailure = { index: number; message: string };

// Creates one reservation per room block, then assigns the chosen
// coordinator to the linked event's GHL opportunity. Returns the blocks
// that failed (e.g. room conflicts) so the modal can keep them open.
// Shared by the room calendar and the events page "Create Event" button.
export async function createReservationBlocks(
  blocks: ReservationFormData[],
  coordinatorUserId?: string,
): Promise<BlockFailure[]> {
  const failures: BlockFailure[] = [];

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

  const eventId = blocks[0]?.event_id;

  if (failures.length < blocks.length && eventId && coordinatorUserId) {
    // Outcome is logged server-side; a GHL hiccup must not fail the save.
    try {
      await api.coordinatorAssignment.set(eventId, coordinatorUserId);
    } catch (err) {
      console.error("Coordinator assignment failed", err);
    }
  }

  return failures;
}
