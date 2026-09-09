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
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
