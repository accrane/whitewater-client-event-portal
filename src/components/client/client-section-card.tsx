type ClientSectionCardProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function ClientSectionCard({
  children,
  title,
  description,
}: ClientSectionCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
