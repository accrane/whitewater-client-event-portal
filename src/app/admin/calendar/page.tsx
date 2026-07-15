import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { RoomCalendar } from "@/components/calendar/room-calendar";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminCalendarPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

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
