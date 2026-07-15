import Link from "next/link";

const sections = [
  "GoHighLevel Event record sync",
  "Planner setup and client preview",
  "Secure client portal launch",
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <section className="mx-auto flex max-w-5xl flex-col gap-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="max-w-3xl space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
            Whitewater Group Events
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Manage Group Events
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            This app shell will become the external portal connected to
            GoHighLevel Event records. GHL remains the system of record while
            this portal handles client-facing checklists, uploads, vendors, and
            planner readiness views.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {sections.map((section) => (
            <div
              key={section}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <p className="text-sm font-medium text-slate-700">{section}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/admin"
          >
            Login to Manage Events
          </Link>
        </div>
      </section>
    </main>
  );
}
