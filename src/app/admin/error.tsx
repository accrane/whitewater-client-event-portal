"use client";

import { Button } from "@/components/ui/button";

// Route error boundary for the admin area. Without one, the Next dev client
// responds to render errors by reloading the page in a loop instead of
// showing anything useful.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The page hit an unexpected error. Try again, and if it keeps
          happening, share the details below with your developer.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 whitespace-pre-wrap text-red-700">
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <div className="mt-5 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button
            onClick={() => window.location.assign("/admin")}
            variant="secondary"
          >
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
