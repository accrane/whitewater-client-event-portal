import type { ReactNode } from "react";
import Link from "next/link";

import { AdminDock, AdminTopBar } from "@/components/admin/admin-dock";
import { AdminThemeScope } from "@/components/admin/admin-theme";
import { Icon } from "@/components/ui/icon";
import { getSignedInPortalUser } from "@/lib/admin/users";

type AdminShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  /** String or inline nodes; use `block`-display spans for multi-line. */
  description?: ReactNode;
  userEmail?: string | null;
  /** Right-aligned page actions: one primary button, secondaries after it. */
  actions?: ReactNode;
  /** Inline metadata rendered next to the title, e.g. a StatusBadge. */
  meta?: ReactNode;
  /** Renders a small back link above the title. */
  backHref?: string;
  backLabel?: string;
};

// Shown in the top bar so a planner can tell a local build from the live app.
const environmentTag =
  process.env.NODE_ENV === "production" ? null : process.env.NODE_ENV;

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

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          environment={environmentTag}
          title={title}
          userEmail={userEmail}
        />

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 xl:px-10 xl:py-8">
          <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              <div className="min-w-0">
                {backHref ? (
                  <Link
                    className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 transition hover:text-slate-950"
                    href={backHref}
                  >
                    <Icon className="h-3.5 w-3.5">
                      <path d="m15 18-6-6 6-6" />
                    </Icon>
                    {backLabel}
                  </Link>
                ) : null}
                {eyebrow ? (
                  <p className="type-label mb-1 text-slate-500">{eyebrow}</p>
                ) : null}
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">
                    {title}
                  </h1>
                  {meta}
                </div>
                {description ? (
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
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
      </div>
    </AdminThemeScope>
  );
}
