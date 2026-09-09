type ClientHeroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

// Page header used across the client-facing portal pages.
export function ClientHero({ eyebrow, title, description }: ClientHeroProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-7 sm:px-8">
      {eyebrow && <p className="type-label mb-2 text-slate-500">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}
