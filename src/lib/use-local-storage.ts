"use client";

import { useCallback, useSyncExternalStore } from "react";

// Subscribes to a single localStorage key without hydration mismatches:
// the server snapshot returns the fallback, and the client re-reads storage
// after hydration. Same-tab writes notify via a per-key custom event since
// the native "storage" event only fires in other tabs.
export function useLocalStorageValue(key: string, fallback: string) {
  const eventName = `local-storage:${key}`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (event: Event) => {
        if (event instanceof StorageEvent && event.key !== key) {
          return;
        }

        onChange();
      };

      window.addEventListener("storage", handler);
      window.addEventListener(eventName, handler);

      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(eventName, handler);
      };
    },
    [key, eventName],
  );

  const value = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) ?? fallback,
    () => fallback,
  );

  const setValue = useCallback(
    (next: string) => {
      window.localStorage.setItem(key, next);
      window.dispatchEvent(new Event(eventName));
    },
    [key, eventName],
  );

  return [value, setValue] as const;
}
