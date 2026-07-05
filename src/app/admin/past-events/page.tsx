import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminPastEventsPage() {
  return (
    <AdminShell
      description="Keep completed event portal history accessible without mixing it into active planner work. Real archived events will be queried later."
      eyebrow="Past Events"
      title="Completed event history"
    >
      <EmptyState
        description="Past event rows will appear here after the admin dashboard is connected to Supabase event data."
        title="No archived events connected yet"
      />
    </AdminShell>
  );
}
