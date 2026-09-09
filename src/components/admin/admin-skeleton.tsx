import { AdminThemeScope } from "@/components/admin/admin-theme";

// Route-level loading fallback that mirrors the admin shell frame so
// navigation feels instant while server data (including GHL syncs) loads.
// Wrapped in AdminThemeScope so dark/forest users get a matching skeleton.
export function AdminPageSkeleton() {
  return (
    <AdminThemeScope>
      <div className="hidden h-screen w-56 shrink-0 border-r border-slate-200 lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden h-12 shrink-0 border-b border-slate-200 lg:block" />
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 xl:px-10 xl:py-8">
          <div className="animate-pulse space-y-6">
            <div>
              <div className="h-7 w-56 max-w-full rounded-md bg-slate-200" />
              <div className="mt-2 h-4 w-96 max-w-full rounded-sm bg-slate-100" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  className="h-20 rounded-lg border border-slate-200 bg-white"
                  key={i}
                />
              ))}
            </div>
            <div className="h-64 rounded-lg border border-slate-200 bg-white" />
          </div>
        </main>
      </div>
    </AdminThemeScope>
  );
}
