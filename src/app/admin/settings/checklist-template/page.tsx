
import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsNav } from "@/components/admin/settings-nav";
import { getChecklistTemplateSections } from "@/lib/admin/checklist-sections";
import { requireAdminUser } from "@/lib/admin/users";

import { TemplateEditor } from "./template-editor";

export default async function ChecklistTemplatePage() {
  // Managers only: templates shape every new event.
  const { user } = await requireAdminUser();

  const sections = await getChecklistTemplateSections();

  return (
    <AdminShell
      description="Edit the checklist clients see in their portal: FAQ-style sections they can expand for details on what they need to do."
      eyebrow="Settings"
      title="Checklist Template"
      userEmail={user.email}
    >
      <SettingsNav />
      <TemplateEditor sections={sections} />
    </AdminShell>
  );
}
