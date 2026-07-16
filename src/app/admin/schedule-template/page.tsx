import { redirect } from "next/navigation";

// The Schedule Template editor moved under Settings; keep old bookmarks alive.
export default function LegacyScheduleTemplatePage() {
  redirect("/admin/settings/schedule-template");
}
