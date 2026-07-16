"use client";

import { useEffect, useRef, useState } from "react";

// Submit button that stays dimmed (and disabled) until something in its form
// actually changes from the server-rendered values.
export function DirtySaveButton({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;

    const serialize = () =>
      JSON.stringify(
        [...new FormData(form).entries()].map(([name, value]) => [
          name,
          String(value),
        ]),
      );

    const initial = serialize();
    const update = () => setDirty(serialize() !== initial);

    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, []);

  return (
    <button
      className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
      disabled={!dirty}
      ref={ref}
      type="submit"
    >
      {children}
    </button>
  );
}
