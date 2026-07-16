import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

export function createBrowserSupabaseClient() {
  // NEXT_PUBLIC_* vars are only inlined into client bundles when accessed
  // statically, so no getEnv() here.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
