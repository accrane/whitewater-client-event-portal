import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  DEFAULT_MANUAL_DOC,
  MANUAL_DOCS,
  isManualDocSlug,
  manualDocHref,
  renderManualDoc,
  type ManualDocSlug,
} from "@/lib/admin/manual";
import { requireStaffUser } from "@/lib/admin/session";

// The user guide, rendered from docs/manual.md. Reached from the "?" in the
// top bar (opens in a new tab so it can sit beside the screen being learned).

export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { user } = await requireStaffUser();

  const { slug: segments = [] } = await params;
  if (segments.length > 1) notFound();
  const requested = segments[0] ?? DEFAULT_MANUAL_DOC;
  if (!isManualDocSlug(requested)) notFound();
  const slug: ManualDocSlug = requested;

  const doc = await renderManualDoc(slug);
  const docSlugs = Object.keys(MANUAL_DOCS) as ManualDocSlug[];

  return (
    <AdminShell
      description="How to work an event in the portal, and what GoHighLevel and PandaDoc do automatically along the way."
      eyebrow="Help"
      title="Manual"
      userEmail={user.email}
    >
      {docSlugs.length > 1 ? (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-3">
          {docSlugs.map((docSlug) => {
            const active = docSlug === slug;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition ${
                  active
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
                href={manualDocHref(docSlug)}
                key={docSlug}
              >
                {MANUAL_DOCS[docSlug].title}
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-start gap-10">
        <article
          className="manual-prose min-w-0 max-w-3xl flex-1"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />

        {doc.headings.length > 0 ? (
          <nav
            aria-label="On this page"
            className="sticky top-16 hidden w-60 shrink-0 xl:block"
          >
            <p className="type-label mb-2 text-slate-500">On this page</p>
            <ol className="max-h-[calc(100vh-7rem)] space-y-0.5 overflow-y-auto border-l border-slate-200 text-[13px]">
              {doc.headings.map((heading) => (
                <li key={heading.id}>
                  <a
                    className={`block border-l py-1 pr-2 leading-5 text-slate-500 transition hover:text-slate-950 ${
                      heading.depth === 2
                        ? "-ml-px border-transparent pl-3 font-medium"
                        : "-ml-px border-transparent pl-6"
                    }`}
                    href={`#${heading.id}`}
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </div>
    </AdminShell>
  );
}
