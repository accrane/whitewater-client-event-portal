import type { ReactNode } from "react";

import { AdminDock } from "@/components/admin/admin-dock";
import { AdminThemeScope } from "@/components/admin/admin-theme";

type AdminShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  userEmail?: string | null;
};

export function AdminShell({
  children,
  eyebrow = "Portal Admin",
  title,
  description,
  userEmail,
}: AdminShellProps) {
  return (
    <AdminThemeScope>
      <AdminDock userEmail={userEmail} />

      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">
        <div className="space-y-6">
          <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              {description}
            </p>
          </header>

          {children}
        </div>
      </main>
    </AdminThemeScope>
  );
}
