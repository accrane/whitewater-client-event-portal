import type { ReactNode } from "react";
import Link from "next/link";

import { AdminDock } from "@/components/admin/admin-dock";
import { AdminThemeScope } from "@/components/admin/admin-theme";
import { Icon } from "@/components/ui/icon";
import { getSignedInPortalUser } from "@/lib/admin/users";

type AdminShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  userEmail?: string | null;
  /** Right-aligned page actions: one primary button, secondaries after it. */
  actions?: ReactNode;
  /** Inline metadata rendered next to the title, e.g. a StatusBadge. */
  meta?: ReactNode;
  /** Renders a small back link above the title. */
  backHref?: string;
  backLabel?: string;
};

export async function AdminShell({
  children,
  eyebrow,
  title,
  description,
  userEmail,
  actions,
  meta,
  backHref,
  backLabel = "Back",
}: AdminShellProps) {
  const portalUser = await getSignedInPortalUser();
  const showAdminNav = portalUser?.role === "admin";

  return (
    <AdminThemeScope>
      <AdminDock showAdminNav={showAdminNav} userEmail={userEmail} />

      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">
        <div className="space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-slate-200 pb-5">
            <div className="min-w-0">
              {backHref ? (
                <Link
                  className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 transition hover:text-slate-950"
                  href={backHref}
                >
                  <Icon className="h-3.5 w-3.5">
                    <path d="m15 18-6-6 6-6" />
                  </Icon>
                  {backLabel}
                </Link>
              ) : null}
              {eyebrow ? (
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  {eyebrow}
                </p>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">
                  {title}
                </h1>
                {meta}
              </div>
              {description ? (
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </header>

          {children}
        </div>
      </main>
    </AdminThemeScope>
  );
}
