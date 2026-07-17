import { redirect } from "next/navigation";

// Past events are now the "Past" filter on the Events list; keep old
// bookmarks alive (same pattern as the other legacy admin routes).
export default function LegacyPastEventsPage() {
  redirect("/admin/events?status=past");
}
