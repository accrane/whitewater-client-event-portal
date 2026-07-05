import Link from "next/link";

import { loginAction } from "./actions";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  "missing-fields": "Enter both an email and password.",
  "invalid-login": "That email/password combination did not work.",
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const { error, next } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
            Portal Admin
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Sign in
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Use the Supabase admin user you created for the client event portal.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <form action={loginAction} className="mt-8 space-y-5">
          <input name="next" type="hidden" value={next || "/admin"} />

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="email"
            >
              Email
            </label>
            <input
              autoComplete="email"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="password"
            >
              Password
            </label>
            <input
              autoComplete="current-password"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>

          <button
            className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            type="submit"
          >
            Sign in
          </button>
        </form>

        <Link
          className="mt-6 inline-flex text-sm font-medium text-slate-600 transition hover:text-slate-950"
          href="/"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
