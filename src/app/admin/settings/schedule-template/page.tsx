
import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsNav } from "@/components/admin/settings-nav";
import { getScheduleTemplateItems } from "@/lib/admin/event-schedule";
import { requireAdminUser } from "@/lib/admin/users";

import { TemplateEditor } from "./template-editor";

export default async function ScheduleTemplatePage() {
  // Managers only: templates shape every new event.
  const { user } = await requireAdminUser();

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
