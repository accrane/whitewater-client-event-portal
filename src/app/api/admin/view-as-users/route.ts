import { getStaffUser } from "@/lib/admin/session";
import { listViewAsCoordinators } from "@/lib/admin/view-as-coordinators";

// Feeds the top bar's "View as" menu: portal logins with the Coordinator
// role. Checked against the real role, since a manager already viewing as a
// coordinator must still be able to switch or stop.
export async function GET() {
  const staff = await getStaffUser();
  if (staff?.realRole !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await listViewAsCoordinators());
  } catch (error) {
    console.error("View-as coordinator list failed", error);
    return Response.json({ error: "Unable to load coordinators" }, { status: 500 });
  }
}
