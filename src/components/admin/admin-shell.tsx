import type { ReactNode } from "react";
import Link from "next/link";

import { logoutAction } from "@/app/admin/actions";

const adminNavItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/past-events", label: "Past Events" },
  { href: "/admin/integration-logs", label: "Integration Logs" },
];

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
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
        <aside className="lg:w-72 lg:shrink-0">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-8">
            <Link className="block" href="/admin">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Client Portal
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                Planner Admin
              </h2>
            </Link>

            <nav aria-label="Admin navigation" className="mt-6 space-y-2">
              {adminNavItems.map((item) => (
                <Link
                  className="block rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6 border-t border-slate-200 pt-5">
              {userEmail ? (
                <p className="text-xs leading-5 text-slate-500">
                  Signed in as
                  <span className="block truncate font-semibold text-slate-700">
                    {userEmail}
                  </span>
                </p>
              ) : null}
              <form action={logoutAction} className="mt-4">
                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
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
      </section>
    </main>
  );
}
