import type { ReactNode } from "react";

// Hover/focus tooltip for icon-only controls. Pure CSS: the label sits
// under the trigger and fades in on hover or keyboard focus, so it works
// inside server and client components alike and never needs positioning
// code. Keep labels to a few words; long text should live in the control.
// `wrap` allows a sentence or two (explaining a status badge), and
// `align="end"` lines the label up with the trigger's right edge for
// triggers against the right side of a card.
export function Tooltip({
  label,
  children,
  className = "",
  align = "center",
  wrap = false,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "center" | "end";
  wrap?: boolean;
}) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        className={`pointer-events-none absolute top-full z-30 mt-1.5 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity delay-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${
          align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
        } ${wrap ? "w-60 whitespace-normal text-left leading-snug" : "whitespace-nowrap leading-tight"}`}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
