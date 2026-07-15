interface StatusBadgeProps {
  status: "held" | "booked";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const isHeld = status === "held";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isHeld
          ? "bg-amber-100 text-amber-800 border border-dashed border-amber-400"
          : "bg-emerald-100 text-emerald-800 border border-solid border-emerald-400"
      }`}
    >
      {isHeld ? "Held" : "Booked"}
    </span>
  );
}
