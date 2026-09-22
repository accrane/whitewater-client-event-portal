import type { ReactNode } from "react";

// Hover/focus tooltip for icon-only controls. Pure CSS: the label sits
// under the trigger and fades in on hover or keyboard focus, so it works
// inside server and client components alike and never needs positioning
// code. Keep labels to a few words; long text should live in the control.
export function Tooltip({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium leading-tight text-white opacity-0 shadow-lg transition-opacity delay-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
