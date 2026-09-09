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

// Sales-side lens: the GHL pipeline plus the company/booking-history
// archive, kept apart from the daily event work above by a rule in the nav.
const salesNavItems: NavItem[] = [
  {
    href: "/admin/opportunities",
    label: "Opportunities",
    icon: (
      <Icon>
        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
      </Icon>
    ),
  },
  {
    href: "/admin/companies",
    label: "Companies",
    icon: (
      <Icon>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
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

// Desktop rail + mobile drawer. The desktop top bar (AdminTopBar) is
// rendered by AdminShell above the page content so it can show the
// breadcrumb for the current page.
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
      <header className="sticky top-0 z-30 flex h-12 items-center border-b border-slate-200 bg-[var(--background)] px-3 lg:hidden">
        <button
          aria-expanded={drawerOpen}
          aria-label="Open navigation"
          className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
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
          <WhitewaterMark className="h-5 w-auto text-[var(--whitewater-red)]" />
        </Link>
      </header>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            aria-label="Admin navigation"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-[var(--background)] shadow-2xl"
            role="dialog"
          >
            <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
              <Link className="flex items-center gap-2.5" href="/admin">
                <WhitewaterMark className="h-5 w-auto text-[var(--whitewater-red)]" />
                <span className="text-sm font-semibold text-slate-950">
                  Planner Admin
                </span>
              </Link>
              <button
                aria-label="Close navigation"
                className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
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
            <DrawerFooter userEmail={userEmail} />
          </div>
        </div>
      ) : null}

      {/* Desktop rail: page-colored, hairline border, icons-only when
          collapsed (Supabase-style), labels when expanded. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-[var(--background)] transition-[width] duration-200 lg:flex ${
          collapsed ? "w-12" : "w-56"
        }`}
      >
        <Link
          aria-label="Planner Admin dashboard"
          className={`flex h-12 shrink-0 items-center gap-2.5 border-b border-slate-200 ${
            collapsed ? "justify-center" : "px-4"
          }`}
          href="/admin"
          title="Planner Admin"
        >
          <WhitewaterMark className="h-5 w-auto shrink-0 text-[var(--whitewater-red)]" />
          {collapsed ? null : (
            <span className="truncate text-sm font-semibold text-slate-950">
              Planner Admin
            </span>
          )}
        </Link>

        <DockNav collapsed={collapsed} showAdminNav={showAdminNav} />

        <div className="border-t border-slate-200 p-2">
          <button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`flex h-8 items-center gap-3 rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 ${
              collapsed ? "w-8 justify-center" : "w-full px-2"
            }`}
            onClick={toggleCollapsed}
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0">
              <rect height="18" rx="2" width="18" x="3" y="3" />
              <path d="M9 3v18" />
              {collapsed ? (
                <path d="m14 9 3 3-3 3" />
              ) : (
                <path d="m16 15-3-3 3-3" />
              )}
            </Icon>
            {collapsed ? null : (
              <span className="text-[13px] font-medium">Collapse</span>
            )}
          </button>
        </div>
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
    const active = isActive(item.href);
    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center gap-3 rounded-md text-[13px] font-medium transition ${
          collapsed ? "w-8 justify-center" : "w-full px-2"
        } ${
          active
            ? "bg-slate-100 text-slate-950"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
        }`}
        href={item.href}
        key={item.href}
        title={collapsed ? item.label : undefined}
      >
        <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
        {collapsed ? null : (
          <span className="truncate whitespace-nowrap">{item.label}</span>
        )}
      </Link>
    );
  }

  return (
    <nav
      aria-label="Admin navigation"
      className="flex flex-1 flex-col overflow-y-auto p-2"
    >
      <div className="space-y-0.5">{workNavItems.map(navLink)}</div>
      <div aria-hidden className="my-2 border-t border-slate-200" />
      <div className="space-y-0.5">{salesNavItems.map(navLink)}</div>
      <div className="mt-auto space-y-0.5 pt-4">
        {navLink(settingsNavItem)}
        {showAdminNav ? navLink(adminOnlyNavItem) : null}
      </div>
    </nav>
  );
}

// Three-way theme switch shared by the desktop top bar and mobile drawer.
export function ThemeSwitch() {
  const { theme, setTheme } = useAdminTheme();

  return (
    <div
      aria-label="Color theme"
      className="flex gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5"
      role="group"
    >
      {themeOptions.map((option) => (
        <button
          aria-label={option.label}
          aria-pressed={theme === option.value}
          className={`flex h-6 w-7 items-center justify-center rounded-sm transition [&>svg]:h-3.5 [&>svg]:w-3.5 ${
            theme === option.value
              ? "bg-white text-slate-950 ring-1 ring-slate-300"
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
  );
}

function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        aria-label={iconOnly ? "Sign out" : undefined}
        className={`flex h-8 items-center gap-2 rounded-md text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 ${
          iconOnly ? "w-8 justify-center" : "w-full px-2"
        }`}
        title={iconOnly ? "Sign out" : undefined}
        type="submit"
      >
        <Icon className="h-4 w-4 shrink-0">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </Icon>
        {iconOnly ? null : <span>Sign out</span>}
      </button>
    </form>
  );
}

function DrawerFooter({ userEmail }: { userEmail?: string | null }) {
  return (
    <div className="space-y-3 border-t border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        {userEmail ? (
          <p className="min-w-0 truncate text-xs text-slate-500">{userEmail}</p>
        ) : (
          <span />
        )}
        <ThemeSwitch />
      </div>
      <SignOutButton />
    </div>
  );
}

const allNavItems = [
  ...workNavItems,
  ...salesNavItems,
  settingsNavItem,
  adminOnlyNavItem,
];

type AdminTopBarProps = {
  /** Page title shown as the last breadcrumb segment. */
  title: string;
  userEmail?: string | null;
  /** Short mono tag after the app name, e.g. "local" while developing. */
  environment?: string | null;
};

// Slim desktop context bar: app name and environment, the section and page
// breadcrumb, then theme, account, and sign out on the right.
export function AdminTopBar({
  title,
  userEmail,
  environment,
}: AdminTopBarProps) {
  const pathname = usePathname();
  const section =
    pathname === "/admin"
      ? null
      : allNavItems.find(
          (item) =>
            item.href !== "/admin" &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`)),
        );
  const showTitle = !section || section.label !== title;

  return (
    <header className="sticky top-0 z-20 hidden h-12 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-[var(--background)] px-4 lg:flex">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-2 text-[13px]"
      >
        <Link
          className="shrink-0 font-medium text-slate-700 transition hover:text-slate-950"
          href="/admin"
        >
          Planner Admin
        </Link>
        {environment ? (
          <span className="type-label rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-px text-amber-800">
            {environment}
          </span>
        ) : null}
        {section ? (
          <>
            <span aria-hidden className="text-slate-300">
              /
            </span>
            <Link
              className="shrink-0 text-slate-500 transition hover:text-slate-950"
              href={section.href}
            >
              {section.label}
            </Link>
          </>
        ) : null}
        {showTitle ? (
          <>
            <span aria-hidden className="text-slate-300">
              /
            </span>
            <span aria-current="page" className="truncate text-slate-950">
              {title}
            </span>
          </>
        ) : null}
      </nav>

      <div className="flex shrink-0 items-center gap-3">
        <ThemeSwitch />
        {userEmail ? (
          <span
            className="hidden max-w-[220px] truncate text-xs text-slate-500 xl:inline"
            title={userEmail}
          >
            {userEmail}
          </span>
        ) : null}
        <SignOutButton iconOnly />
      </div>
    </header>
  );
}
