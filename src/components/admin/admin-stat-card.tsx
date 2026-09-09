import type { ReactNode } from "react";
import Link from "next/link";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  /** Optional glyph shown in a bordered square beside the value. */
  icon?: ReactNode;
  /** When set, the whole card links to the detail behind the number. */
  href?: string;
};

// Metric tile: mono label over the value, with an optional icon well on the
// left. Kept flat (border, no shadow) so a row of them reads as one strip.
export function AdminStatCard({
  label,
  value,
  hint,
  icon,
  href,
}: StatCardProps) {
  const content = (
    <>
      {icon ? (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="type-label text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </>
  );

  const frame =
    "flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4";

  if (href) {
    return (
      <Link
        className={`${frame} transition hover:border-slate-400`}
        href={href}
      >
        {content}
      </Link>
    );
  }

  return <article className={frame}>{content}</article>;
}
