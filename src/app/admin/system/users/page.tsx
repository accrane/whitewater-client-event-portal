import { AdminShell } from "@/components/admin/admin-shell";
import { FlashBanner } from "@/components/admin/flash-banner";
import { SystemNav } from "@/components/admin/system-nav";
import {
  listPortalUsers,
  requireAdminUser,
  PORTAL_ROLES,
  type PortalUserSummary,
} from "@/lib/admin/users";

import {
  createUserAction,
  deleteUserAction,
  sendResetEmailAction,
  setUserPasswordAction,
  setUserRoleAction,
} from "./actions";

type AdminUsersPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const { user } = await requireAdminUser();
  const { notice, error } = await searchParams;
  const users = await listPortalUsers();

  return (
    <AdminShell
      description="Everyone who can sign in to the planner admin. Admins additionally see this Admin area and admin-only event fields."
      eyebrow="Admin"
      title="Users"
      userEmail={user.email}
    >
      <SystemNav />

      {notice ? <FlashBanner>{notice}</FlashBanner> : null}

      {error ? <FlashBanner tone="error">{error}</FlashBanner> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">Add a user</h2>
        <form
          action={createUserAction}
          className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end"
        >
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Email
            <input
              autoComplete="off"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Temporary password
            <input
              autoComplete="new-password"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Role
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue="planner"
              name="role"
            >
              {PORTAL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            type="submit"
          >
            Create user
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Share the temporary password directly, or use &ldquo;Email reset
          link&rdquo; below so they can choose their own.
        </p>
      </section>

      <section className="space-y-4">
        {users.map((portalUser) => (
          <UserCard
            currentUserId={user.id}
            key={portalUser.id}
            user={portalUser}
          />
        ))}
      </section>
    </AdminShell>
  );
}

function roleLabel(role: string): string {
  return role === "admin" ? "Admin" : "Planner";
}

function UserCard({
  user,
  currentUserId,
}: {
  user: PortalUserSummary;
  currentUserId: string;
}) {
  const isSelf = user.id === currentUserId;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-950">{user.email}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            user.role === "admin"
              ? "bg-violet-100 text-violet-800"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {roleLabel(user.role)}
        </span>
        {isSelf ? (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
            You
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-500">Created</dt>
          <dd>{formatDateTime(user.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Last sign-in</dt>
          <dd>{user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "Never"}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-3">
        <form action={setUserRoleAction} className="flex items-end gap-2">
          <input name="userId" type="hidden" value={user.id} />
          <input name="email" type="hidden" value={user.email} />
          <label className="grid flex-1 gap-1 text-xs font-semibold text-slate-500">
            Role
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={user.role}
              name="role"
            >
              {PORTAL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="submit"
          >
            Save role
          </button>
        </form>

        <form action={setUserPasswordAction} className="flex items-end gap-2">
          <input name="userId" type="hidden" value={user.id} />
          <input name="email" type="hidden" value={user.email} />
          <label className="grid flex-1 gap-1 text-xs font-semibold text-slate-500">
            New password
            <input
              autoComplete="new-password"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="submit"
          >
            Set
          </button>
        </form>

        <form action={sendResetEmailAction} className="flex items-end">
          <input name="email" type="hidden" value={user.email} />
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="submit"
          >
            Email reset link
          </button>
        </form>
      </div>

      {!isSelf ? (
        <form
          action={deleteUserAction}
          className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4"
        >
          <input name="userId" type="hidden" value={user.id} />
          <input name="email" type="hidden" value={user.email} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              className="h-4 w-4 rounded border-slate-300"
              name="deleteConfirmation"
              required
              type="checkbox"
              value="delete-user-confirmed"
            />
            Permanently delete this user
          </label>
          <button
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            type="submit"
          >
            Delete
          </button>
        </form>
      ) : null}
    </article>
  );
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
