import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { getAdminDashboardMetrics } from "@/lib/admin/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const metrics = await getAdminDashboardMetrics();

  return (
    <AdminShell
      description="A planner dashboard for draft portals, launched portals, upcoming client events, and integration records that need review. Counts are read-only from Supabase."
      title="Dashboard"
      userEmail={user.email}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminStatCard
          description="Events waiting for planner setup before a client portal is launched."
          title="Draft Portals"
          value={String(metrics.draftPortalCount)}
        />
        <AdminStatCard
          description="Client-facing portals currently marked as launched."
          title="Launched Portals"
          value={String(metrics.launchedPortalCount)}
        />
        <AdminStatCard
          description="Launched portals with an event date today or later in the stored GHL snapshot."
          title="Upcoming Events"
          value={String(metrics.upcomingLaunchedCount)}
        />
        <AdminStatCard
          description="Recent integration warnings or errors to review in the GHL sync activity page."
          title="Integration Review"
          value={String(metrics.integrationReviewCount)}
        />
        <AdminStatCard
          description="Client-submitted checklist items waiting for planner review before completion."
          title="Checklist Review"
          value={String(metrics.checklistReviewCount)}
        />
      </div>
    </AdminShell>
  );
}
