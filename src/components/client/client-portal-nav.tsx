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
      <WhitewaterMark className="h-9 w-auto shrink-0 text-slate-950" />
      <nav
        aria-label="Portal navigation"
        className="flex w-fit gap-1 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {items.map((item) => (
          <Link
            aria-current={item.key === active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              item.key === active
                ? "bg-slate-950 text-white"
                : "text-slate-700 hover:bg-slate-100"
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
