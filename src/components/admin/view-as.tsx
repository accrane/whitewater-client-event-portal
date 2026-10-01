"use client";

import { useEffect, useRef, useState } from "react";

import { startViewAsAction, stopViewAsAction } from "@/app/admin/actions";
import { Icon } from "@/components/ui/icon";

// Manager-only "View as" control in the top bar: pick a coordinator login
// and the portal shows what they see (lib/admin/view-as.ts). The list loads
// when the menu first opens, so pages don't pay for it.

type Coordinator = {
  userId: string;
  email: string;
  // GHL name when the login matches a GHL user; null for a login-only
  // coordinator (such as a test account), shown by email instead.
  name: string | null;
};

export function ViewAsMenu({
  current,
}: {
  // The coordinator being viewed as, when one is.
  current: { email: string; label: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [coordinators, setCoordinators] = useState<Coordinator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Runs the server action, then closes the menu once the page has
  // refreshed with the new view.
  const submitAndClose =
    (action: (formData: FormData) => Promise<void>) => async (formData: FormData) => {
      setBusy(true);
      try {
        await action(formData);
        setOpen(false);
      } finally {
        setBusy(false);
      }
    };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    setOpen((value) => !value);
    if (coordinators !== null) return;
    setError(null);
    fetch("/api/admin/view-as-users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load coordinators");
        setCoordinators((await res.json()) as Coordinator[]);
      })
      .catch(() => setError("Unable to load coordinators. Try again."));
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition ${
          current
            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
        }`}
        onClick={toggle}
        type="button"
      >
        <Icon className="h-4 w-4 shrink-0">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </Icon>
        <span className="max-w-[180px] truncate">
          {current ? `Viewing as ${current.label}` : "View as"}
        </span>
        <Icon className="h-3 w-3 shrink-0">
          <path d="m6 9 6 6 6-6" />
        </Icon>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-xl"
          role="menu"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs leading-5 text-slate-500">
            See the portal the way a coordinator does. Anything you save is
            still recorded as you.
          </p>
          <div className="max-h-72 overflow-y-auto py-1">
            {error ? (
              <p className="px-3 py-2 text-xs text-red-800">{error}</p>
            ) : coordinators === null ? (
              <p className="px-3 py-2 text-xs text-slate-500">Loading…</p>
            ) : coordinators.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">
                No coordinator logins yet. Add one under Admin → Users.
              </p>
            ) : (
              coordinators.map((coordinator) => {
                const active =
                  current?.email.toLowerCase() === coordinator.email.toLowerCase();
                return (
                  // The menu closes once the action has run, not on click:
                  // closing first would remove the form before it submits.
                  <form action={submitAndClose(startViewAsAction)} key={coordinator.userId}>
                    <input name="userId" type="hidden" value={coordinator.userId} />
                    <button
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-100 disabled:opacity-60 ${
                        active ? "font-semibold text-slate-950" : "text-slate-700"
                      }`}
                      disabled={active || busy}
                      role="menuitem"
                      type="submit"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{coordinator.name ?? coordinator.email}</span>
                        {coordinator.name ? (
                          <span className="block truncate text-[11px] text-slate-500">
                            {coordinator.email}
                          </span>
                        ) : (
                          <span className="block text-[11px] text-slate-500">
                            No GHL user with this email
                          </span>
                        )}
                      </span>
                      {active ? (
                        <span className="type-label shrink-0 text-amber-800">Viewing</span>
                      ) : null}
                    </button>
                  </form>
                );
              })
            )}
          </div>
          {current ? (
            <form action={submitAndClose(stopViewAsAction)} className="border-t border-slate-100 p-1">
              <button
                className="w-full rounded-md px-2 py-1.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 disabled:opacity-60"
                disabled={busy}
                role="menuitem"
                type="submit"
              >
                Back to manager view
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Strip across the top of every page while a manager is viewing as a
// coordinator, on every screen size (the menu itself is desktop-only).
export function ViewAsBanner({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
      <p>
        <span className="font-semibold">Viewing as {name}.</span> You see what
        this coordinator sees. Anything you save is still recorded as you.
      </p>
      <form action={stopViewAsAction}>
        <button
          className="rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
          type="submit"
        >
          Back to manager view
        </button>
      </form>
    </div>
  );
}
