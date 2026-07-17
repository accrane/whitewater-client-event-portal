"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const settingsNavItems = [
  { href: "/admin/settings/schedule-template", label: "Schedule Template" },
  { href: "/admin/settings/checklist-template", label: "Checklist Template" },
];

// Segmented subnavigation shared by every page under /admin/settings.
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="inline-flex flex-wrap items-center gap-1 self-start rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
    >
      {settingsNavItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
              active
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
