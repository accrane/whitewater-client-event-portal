import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { SystemNav } from "@/components/admin/system-nav";
import { requireAdminUser } from "@/lib/admin/users";

export default async function AdminSystemPage() {
  const { user } = await requireAdminUser();

  return (
    <AdminShell
      description="Admin-only tools: manage who can sign in and inspect the GHL integration."
      eyebrow="Admin"
      title="Administration"
      userEmail={user.email}
    >
      <SystemNav />

      <section className="grid gap-4 sm:grid-cols-2">
        <SystemCard
          description="Create and remove users, reset passwords, and assign the admin or planner role."
          href="/admin/system/users"
          title="Users"
        />
        <SystemCard
          description="Inspect the log of portal-to-GHL syncs and webhook intake."
          href="/admin/system/integration-logs"
          title="Integration Logs"
        />
      </section>
    </AdminShell>
  );
}

function SystemCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400"
      href={href}
    >
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </Link>
  );
}
