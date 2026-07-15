"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useLocalStorageValue } from "@/lib/use-local-storage";

export type AdminTheme = "light" | "dark" | "forest";

const THEME_STORAGE_KEY = "admin-theme";

function isAdminTheme(value: string): value is AdminTheme {
  return value === "light" || value === "dark" || value === "forest";
}

const AdminThemeContext = createContext<{
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
}>({
  theme: "light",
  setTheme: () => {},
});

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}

// Wraps the admin shell and stamps the selected theme as a data attribute so
// the [data-theme] variable overrides in globals.css apply to admin pages only.
export function AdminThemeScope({ children }: { children: ReactNode }) {
  const [storedTheme, setStoredTheme] = useLocalStorageValue(
    THEME_STORAGE_KEY,
    "light",
  );
  const theme = isAdminTheme(storedTheme) ? storedTheme : "light";

  function setTheme(next: AdminTheme) {
    setStoredTheme(next);
  }

  return (
    <AdminThemeContext.Provider value={{ theme, setTheme }}>
      <div
        className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        data-theme={theme}
      >
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}
