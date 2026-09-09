"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

// Right-side slide-over panel shared by the event page drawers
// (conversations, notes): animated enter/exit, backdrop, Escape-to-close.
// Children receive requestClose so inner close buttons play the exit
// animation before the parent unmounts the drawer.
export function SlideOver({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}) {
  // Mounts off-screen, flips visible on the next frame so the entrance
  // animates, and flips back before unmounting so the exit animates too.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const requestClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close panel"
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={requestClose}
        type="button"
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {children(requestClose)}
      </aside>
    </div>
  );
}

export function SlideOverCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Close"
      className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
      onClick={onClick}
      type="button"
    >
      <svg fill="none" height="18" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="18">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}
