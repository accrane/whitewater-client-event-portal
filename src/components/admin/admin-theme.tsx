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
        className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] lg:flex-row"
        data-theme={theme}
        suppressHydrationWarning
      >
        {/* Applies the stored theme while the HTML is still parsing so dark
            and forest users don't get a light flash before hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="forest")document.currentScript.parentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}
