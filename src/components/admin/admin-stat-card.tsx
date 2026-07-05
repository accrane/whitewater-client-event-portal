type StatCardProps = {
  title: string;
  description: string;
  value?: string;
};

export function AdminStatCard({ title, description, value }: StatCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {value ? (
        <p className="mb-3 text-3xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
      ) : null}
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}
