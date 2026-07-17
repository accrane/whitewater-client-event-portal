"use client";

import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/button";

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
      className={buttonClasses("primary")}
      disabled={!dirty}
      ref={ref}
      type="submit"
    >
      {children}
    </button>
  );
}
