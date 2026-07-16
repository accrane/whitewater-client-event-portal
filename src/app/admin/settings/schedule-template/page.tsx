import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsNav } from "@/components/admin/settings-nav";
import { getScheduleTemplateItems } from "@/lib/admin/event-schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { TemplateEditor } from "./template-editor";

export default async function ScheduleTemplatePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const items = await getScheduleTemplateItems();

  return (
    <AdminShell
      description="Edit the skeleton schedule that new events start from. Applying the template on an event copies these tiles, so per-event changes never affect this template."
      eyebrow="Settings"
      title="Schedule Template"
      userEmail={user.email}
    >
      <SettingsNav />
      <TemplateEditor items={items} />
    </AdminShell>
  );
}
