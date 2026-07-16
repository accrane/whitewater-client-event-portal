import { redirect } from "next/navigation";

// Integration Logs moved into the admin-only section; keep old bookmarks alive.
export default function LegacyIntegrationLogsPage() {
  redirect("/admin/system/integration-logs");
}
