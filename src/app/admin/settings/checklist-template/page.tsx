import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsNav } from "@/components/admin/settings-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Route reserved ahead of the checklist template editor build-out.
export default async function ChecklistTemplatePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <AdminShell
      description="Manage the default checklist applied to new events."
      eyebrow="Settings"
      title="Checklist Template"
      userEmail={user.email}
    >
      <SettingsNav />

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">
          Checklist template editing is coming soon.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          For now, checklist templates are seeded in Supabase and applied per
          event from the event detail page.
        </p>
      </div>
    </AdminShell>
  );
}
