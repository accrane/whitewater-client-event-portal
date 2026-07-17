import type { ReactNode } from "react";

// Shared wrapper for inline Lucide-style outline icon paths, so pages don't
// each declare their own svg boilerplate (was DockIcon / StatusGlyph).
export function Icon({
  children,
  className = "h-5 w-5 shrink-0",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}
