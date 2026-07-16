import Link from "next/link";

import { forgotPasswordAction, loginAction } from "./actions";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
    sent?: string;
    view?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  "missing-fields": "Enter both an email and password.",
  "invalid-login": "That email/password combination did not work.",
  "missing-email": "Enter the email on your account.",
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const { error, next, sent, view } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  if (view === "forgot") {
    return (
      <LoginLayout
        description="Enter your account email and we'll send a link to choose a new password."
        title="Reset password"
      >
        {errorMessage ? <ErrorCallout message={errorMessage} /> : null}

        {sent === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            If an account exists for that email, a reset link is on its way.
            Check your inbox.
          </div>
        ) : null}

        <form action={forgotPasswordAction} className="mt-8 space-y-5">
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

          <button
            className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            type="submit"
          >
            Send reset link
          </button>
        </form>

        <Link
          className="mt-6 inline-flex text-sm font-medium text-slate-600 transition hover:text-slate-950"
          href="/admin/login"
        >
          Back to sign in
        </Link>
      </LoginLayout>
    );
  }

  return (
    <LoginLayout
      description="Sign in with your planner admin account."
      title="Sign in"
    >
      {errorMessage ? <ErrorCallout message={errorMessage} /> : null}

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

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
          href="/admin/login?view=forgot"
        >
          Forgot password?
        </Link>
        <Link
          className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
          href="/"
        >
          Back to home
        </Link>
      </div>
    </LoginLayout>
  );
}

function LoginLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
            Portal Admin
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>

        {children}
      </section>
    </main>
  );
}

function ErrorCallout({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
