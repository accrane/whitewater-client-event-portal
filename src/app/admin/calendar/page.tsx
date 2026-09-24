
import { AdminShell } from "@/components/admin/admin-shell";
import { RoomCalendar } from "@/components/calendar/room-calendar";
import { requireStaffUser } from "@/lib/admin/session";

export default async function AdminCalendarPage() {
  const { user } = await requireStaffUser();

  return (
    <AdminShell
      description="Room availability at a glance. Click an empty slot to create a hold or booking, click a reservation to edit or confirm it, and drag to move or resize."
      title="Room Calendar"
      userEmail={user.email}
    >
      <RoomCalendar />
    </AdminShell>
  );
}
