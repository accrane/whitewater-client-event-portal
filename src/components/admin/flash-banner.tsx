"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const AUTO_DISMISS_MS = 6000;

const toneClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
} as const;

// One-time confirmation banner driven by a query param. Auto-dismisses after
// a few seconds (or via the close button) and strips the query param from the
// URL so a refresh doesn't resurrect it.
export function FlashBanner({
  children,
  tone = "success",
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClasses;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => {
    setVisible(false);
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      className={`relative rounded-2xl border p-5 pr-12 text-sm ${toneClasses[tone]}`}
      role="status"
    >
      {children}
      <button
        aria-label="Dismiss notification"
        className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none opacity-60 transition hover:bg-black/5 hover:opacity-100"
        onClick={dismiss}
        type="button"
      >
        &times;
      </button>
    </div>
  );
}
