import Link from "next/link";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  /** When set, the whole card links to the detail behind the number. */
  href?: string;
};

export function AdminStatCard({ label, value, hint, href }: StatCardProps) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
        href={href}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {content}
    </article>
  );
}
