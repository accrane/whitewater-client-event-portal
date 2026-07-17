import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsNav } from "@/components/admin/settings-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <AdminShell
      description="Templates and defaults that shape every new event. Changes here never touch events that were already set up."
      eyebrow="Admin"
      title="Settings"
      userEmail={user.email}
    >
      <SettingsNav />

      <section className="grid gap-4 sm:grid-cols-2">
        <SettingsCard
          description="Edit the skeleton schedule that new events start from."
          href="/admin/settings/schedule-template"
          title="Schedule Template"
        />
        <SettingsCard
          description="Manage the default checklist applied to new events. Coming soon."
          href="/admin/settings/checklist-template"
          title="Checklist Template"
        />
      </section>
    </AdminShell>
  );
}

function SettingsCard({
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
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400"
      href={href}
    >
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </Link>
  );
}
