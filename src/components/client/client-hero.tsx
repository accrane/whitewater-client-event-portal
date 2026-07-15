type ClientHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
};

// Dark branded header used across the client-facing portal pages.
export function ClientHero({ eyebrow, title, description }: ClientHeroProps) {
  return (
    <div className="bg-slate-950 px-6 py-8 text-white sm:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
        {eyebrow}
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
        {description}
      </p>
    </div>
  );
}
