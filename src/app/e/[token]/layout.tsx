import type { ReactNode } from "react";

// The client portal shares the admin's light design tokens (neutral grays,
// green accent, small radii) via the same [data-theme] scope, with no theme
// switch: clients always get the light look.
export default function ClientPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
      data-theme="light"
    >
      {children}
    </div>
  );
}
