import { AdminThemeScope } from "@/components/admin/admin-theme";

// Route-level loading fallback that mirrors the admin shell frame so
// navigation feels instant while server data (including GHL syncs) loads.
// Wrapped in AdminThemeScope so dark/forest users get a matching skeleton.
export function AdminPageSkeleton() {
  return (
    <AdminThemeScope>
      <div className="hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white lg:block" />
      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">
        <div className="animate-pulse space-y-6">
          <div className="border-b border-slate-200 pb-5">
            <div className="h-7 w-56 max-w-full rounded-md bg-slate-200" />
            <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-100" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                className="h-24 rounded-xl border border-slate-200 bg-white shadow-sm"
                key={i}
              />
            ))}
          </div>
          <div className="h-64 rounded-xl border border-slate-200 bg-white shadow-sm" />
        </div>
      </main>
    </AdminThemeScope>
  );
}
