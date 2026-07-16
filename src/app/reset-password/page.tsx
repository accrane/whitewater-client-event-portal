"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ViewState = "checking" | "ready" | "invalid" | "saving" | "done";

// Landing page for the Supabase recovery-email link (kept outside /admin so
// the auth middleware never intercepts the link's code exchange). The browser
// client exchanges the ?code= in the URL for a session automatically; once
// that session exists the user can pick a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [state, setState] = useState<ViewState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The code exchange may still be in flight on first render; poll briefly
    // before declaring the link invalid.
    const waitForSession = async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session) {
          setState("ready");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (!cancelled) setState("invalid");
    };

    waitForSession();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Passwords need at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setState("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setState("ready");
      return;
    }

    setState("done");
    setTimeout(() => router.push("/admin"), 1500);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
          Portal Admin
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Choose a new password
        </h1>

        {state === "checking" ? (
          <p className="mt-6 text-sm leading-6 text-slate-600">
            Checking your reset link…
          </p>
        ) : null}

        {state === "invalid" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              This reset link is invalid or has expired.
            </div>
            <Link
              className="inline-flex text-sm font-medium text-slate-600 transition hover:text-slate-950"
              href="/admin/login?view=forgot"
            >
              Request a new reset link
            </Link>
          </div>
        ) : null}

        {state === "done" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Password updated. Taking you to the admin…
          </div>
        ) : null}

        {state === "ready" || state === "saving" ? (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="password"
              >
                New password
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
                id="password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="confirm"
              >
                Confirm new password
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
                id="confirm"
                minLength={8}
                onChange={(event) => setConfirm(event.target.value)}
                required
                type="password"
                value={confirm}
              />
            </div>

            <button
              className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              disabled={state === "saving"}
              type="submit"
            >
              {state === "saving" ? "Saving…" : "Set new password"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
