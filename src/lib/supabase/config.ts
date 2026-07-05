export function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    storageBucket:
      process.env.SUPABASE_STORAGE_BUCKET || "event-uploads",
  };
}
