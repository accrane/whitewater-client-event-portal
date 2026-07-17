"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { logoutAction } from "@/app/admin/actions";
import { useAdminTheme, type AdminTheme } from "@/components/admin/admin-theme";
import { WhitewaterMark } from "@/components/branding/whitewater-mark";
import { Icon } from "@/components/ui/icon";
import { useLocalStorageValue } from "@/lib/use-local-storage";

const COLLAPSE_STORAGE_KEY = "admin-dock-collapsed";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

// Day-to-day working areas, grouped by intent. Past events live inside the
// Events list as a filter rather than as their own nav destination.
const workNavItems: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: (
      <Icon>
        <rect height="9" rx="1" width="7" x="3" y="3" />
        <rect height="5" rx="1" width="7" x="14" y="3" />
        <rect height="9" rx="1" width="7" x="14" y="12" />
        <rect height="5" rx="1" width="7" x="3" y="16" />
      </Icon>
    ),
  },
  {
    href: "/admin/events",
    label: "Events",
    icon: (
      <Icon>
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2" />
        <path d="M13 17v2" />
        <path d="M13 11v2" />
      </Icon>
    ),
  },
  {
    href: "/admin/calendar",
    label: "Room Calendar",
    icon: (
      <Icon>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect height="18" rx="2" width="18" x="3" y="4" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
        <path d="M16 18h.01" />
      </Icon>
    ),
  },
  {
    href: "/admin/assignments",
    label: "Planner Assignments",
    icon: (
      <Icon>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icon>
    ),
  },
];

// Configuration lives at the bottom of the nav, away from daily work.
const settingsNavItem: NavItem = {
  href: "/admin/settings",
  label: "Settings",
  icon: (
    <Icon>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
};

// Shown only to admin-role users; houses user management and integration logs.
const adminOnlyNavItem: NavItem = {
  href: "/admin/system",
  label: "Admin",
  icon: (
    <Icon>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
    </Icon>
  ),
};

const themeOptions: Array<{
  value: AdminTheme;
  label: string;
  icon: ReactNode;
}> = [
  {
    value: "light",
    label: "Light theme",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </Icon>
    ),
  },
  {
    value: "dark",
    label: "Dark theme",
    icon: (
      <Icon>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </Icon>
    ),
  },
  {
    value: "forest",
    label: "Forest theme",
    icon: (
      <Icon>
        <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z" />
        <path d="M12 22v-3" />
      </Icon>
    ),
  },
];

type AdminDockProps = {
  userEmail?: string | null;
  showAdminNav?: boolean;
};

export function AdminDock({ userEmail, showAdminNav }: AdminDockProps) {
  const pathname = usePathname();
  const [collapsedValue, setCollapsedValue] = useLocalStorageValue(
    COLLAPSE_STORAGE_KEY,
    "false",
  );
  const collapsed = collapsedValue === "true";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer on navigation (state adjusted during render per
  // react.dev "storing information from previous renders") and on Escape.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsedValue(String(!collapsed));
  }

  return (
    <>
      {/* Mobile top bar: hamburger sits on the left, matching the side the
          drawer slides out from; the mark is centered on its own. */}
      <header className="sticky top-0 z-30 flex items-center border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          aria-expanded={drawerOpen}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          onClick={() => setDrawerOpen(true)}
          type="button"
        >
          <Icon>
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </Icon>
        </button>
        <Link
          aria-label="Planner Admin dashboard"
          className="absolute left-1/2 -translate-x-1/2"
          href="/admin"
        >
          <WhitewaterMark className="h-6 w-auto text-slate-950" />
        </Link>
      </header>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            aria-label="Admin navigation"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <Link className="flex items-center gap-3" href="/admin">
                <WhitewaterMark className="h-6 w-auto text-slate-950" />
                <span className="text-sm font-semibold tracking-tight text-slate-950">
                  Planner Admin
                </span>
              </Link>
              <button
                aria-label="Close navigation"
                className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <Icon>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </Icon>
              </button>
            </div>
            <DockNav collapsed={false} showAdminNav={showAdminNav} />
            <DockFooter collapsed={false} userEmail={userEmail} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
      >
        <div
          className={`flex items-center gap-3 border-b border-slate-200 px-4 py-4 ${
            collapsed ? "flex-col" : "justify-between"
          }`}
        >
          <Link
            className="flex min-w-0 items-center gap-3"
            href="/admin"
            title="Planner Admin"
          >
            <WhitewaterMark className="h-7 w-auto shrink-0 text-slate-950" />
            {collapsed ? null : (
              <span className="truncate text-sm font-semibold tracking-tight text-slate-950">
                Planner Admin
              </span>
            )}
          </Link>
          <button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            onClick={toggleCollapsed}
            type="button"
          >
            <Icon>
              <rect height="18" rx="2" width="18" x="3" y="3" />
              <path d="M9 3v18" />
            </Icon>
          </button>
        </div>

        <DockNav collapsed={collapsed} showAdminNav={showAdminNav} />
        <DockFooter collapsed={collapsed} userEmail={userEmail} />
      </aside>
    </>
  );
}

function DockNav({
  collapsed,
  showAdminNav,
}: {
  collapsed: boolean;
  showAdminNav?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") {
      return pathname === "/admin";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLink(item: NavItem) {
    return (
      <Link
        aria-current={isActive(item.href) ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition ${
          collapsed ? "justify-center" : ""
        } ${
          isActive(item.href)
            ? "bg-slate-950 text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
        }`}
        href={item.href}
        key={item.href}
        title={collapsed ? item.label : undefined}
      >
        {item.icon}
        {collapsed ? null : (
          <span className="truncate whitespace-nowrap">{item.label}</span>
        )}
      </Link>
    );
  }

  return (
    <nav
      aria-label="Admin navigation"
      className="flex flex-1 flex-col overflow-y-auto px-3 py-4"
    >
      <div className="space-y-1">{workNavItems.map(navLink)}</div>
      <div className="mt-auto space-y-1 pt-4">
        {navLink(settingsNavItem)}
        {showAdminNav ? navLink(adminOnlyNavItem) : null}
      </div>
    </nav>
  );
}

function DockFooter({
  collapsed,
  userEmail,
}: {
  collapsed: boolean;
  userEmail?: string | null;
}) {
  const { theme, setTheme } = useAdminTheme();

  return (
    <div className="border-t border-slate-200 px-3 py-4">
      <div
        aria-label="Color theme"
        className={`mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 ${
          collapsed ? "flex-col" : ""
        }`}
        role="group"
      >
        {themeOptions.map((option) => (
          <button
            aria-label={option.label}
            aria-pressed={theme === option.value}
            className={`flex flex-1 items-center justify-center rounded-md p-1.5 transition ${
              theme === option.value
                ? "bg-slate-950 text-white"
                : "text-slate-500 hover:text-slate-950"
            }`}
            key={option.value}
            onClick={() => setTheme(option.value)}
            title={option.label}
            type="button"
          >
            {option.icon}
          </button>
        ))}
      </div>

      {userEmail && !collapsed ? (
        <p className="px-3 pb-3 text-xs leading-5 text-slate-500">
          Signed in as
          <span className="block truncate font-semibold text-slate-700">
            {userEmail}
          </span>
        </p>
      ) : null}
      <form action={logoutAction}>
        <button
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "Sign out" : undefined}
          type="submit"
        >
          <Icon>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </Icon>
          {collapsed ? null : <span>Sign out</span>}
        </button>
      </form>
    </div>
  );
}
