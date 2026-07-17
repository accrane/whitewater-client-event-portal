export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-100 text-sky-900",
};

// Compact labeled status pill. Tone maps to the app's semantic colors:
// amber = draft/pending, emerald = launched/success, red = error/destructive,
// sky = informational, slate = inactive/neutral.
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
