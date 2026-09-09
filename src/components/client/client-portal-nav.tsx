import Link from "next/link";

import { WhitewaterMark } from "@/components/branding/whitewater-mark";

type ClientPortalNavProps = {
  token: string;
  active: "overview" | "schedule";
};

export function ClientPortalNav({ token, active }: ClientPortalNavProps) {
  const items = [
    { key: "overview", label: "Overview", href: `/e/${token}` },
    { key: "schedule", label: "Event Schedule", href: `/e/${token}/schedule` },
  ] as const;

  return (
    <div className="flex items-center gap-4">
      <WhitewaterMark className="h-8 w-auto shrink-0 text-[var(--whitewater-red)]" />
      <nav
        aria-label="Portal navigation"
        className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1"
      >
        {items.map((item) => (
          <Link
            aria-current={item.key === active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              item.key === active
                ? "bg-slate-100 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
