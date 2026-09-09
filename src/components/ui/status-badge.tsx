export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-300 bg-slate-100 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-100 text-sky-900",
};

// Compact bordered status chip in the technical label style. Tone maps to
// the app's semantic colors: amber = draft/pending, emerald = launched/
// success, red = error/destructive, sky = informational, slate = inactive.
// Non-neutral tones also carry a dot so the state reads without color.
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`type-label inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 whitespace-nowrap ${toneClasses[tone]}`}
    >
      {tone !== "neutral" ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}
