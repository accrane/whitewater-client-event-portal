"use client";

import { useEffect, useRef, useState } from "react";

// Detail-row value that copies itself to the clipboard on click; hovering
// shows a "Click to copy" hint, clicking swaps it to "Copied!" briefly.
export function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; fall back to execCommand.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className="group inline-flex max-w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-left text-slate-800"
      onClick={handleCopy}
      title="Click to copy"
      type="button"
    >
      <span className="break-all underline decoration-slate-300 decoration-dashed underline-offset-4 transition group-hover:decoration-slate-500">
        {value}
      </span>
      <span
        aria-live="polite"
        className={
          copied
            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100"
        }
      >
        {copied ? "Copied!" : "Click to copy"}
      </span>
    </button>
  );
}
