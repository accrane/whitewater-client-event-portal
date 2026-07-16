"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const settingsNavItems = [
  { href: "/admin/settings/schedule-template", label: "Schedule Template" },
  { href: "/admin/settings/checklist-template", label: "Checklist Template" },
];

// Pill-style subnavigation shared by every page under /admin/settings.
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
      {settingsNavItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-slate-950 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-100"
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
