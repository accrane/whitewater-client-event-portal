// "View as" lets a manager see the portal the way one coordinator does, to
// check coordinator screens without a second login. The choice lives in a
// cookie that is only honoured for managers (session.ts), so it can only
// ever narrow what someone sees. It changes what is shown and allowed, not
// who did something: anything saved while viewing as a coordinator is still
// recorded under the manager's own login. Import-free so the tests can use it.

export const VIEW_AS_COOKIE = "portal_view_as";

// The view ends by itself after a working day, so a forgotten one doesn't
// leave a manager looking at a coordinator's portal tomorrow.
export const VIEW_AS_MAX_AGE_SECONDS = 8 * 60 * 60;

// The coordinator login being viewed as, resolved the way a real sign-in
// by that login would be: their email, plus the GHL user with that email
// when there is one (events store their coordinator by GHL id, name and
// email, and "my events" matches on all three).
export type ViewAs = {
  email: string;
  ghlUserId: string | null;
  name: string | null;
};

// What to call them on screen: the GHL name when matched, else the login.
export function viewAsLabel(viewAs: ViewAs): string {
  return viewAs.name ?? viewAs.email;
}

export function serializeViewAs(viewAs: ViewAs): string {
  return JSON.stringify({
    email: viewAs.email,
    ghlUserId: viewAs.ghlUserId,
    name: viewAs.name,
  });
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseViewAs(raw: string | null | undefined): ViewAs | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ViewAs> | null;
    if (!value || typeof value !== "object") return null;
    const email = optionalText(value.email);
    if (!email) return null;
    return {
      email,
      ghlUserId: optionalText(value.ghlUserId),
      name: optionalText(value.name),
    };
  } catch {
    return null;
  }
}

// The coordinator this request is viewing as, or null. Only a manager's
// cookie counts: on anyone else's request it is ignored, whatever it says.
export function resolveViewAs(
  realRole: string | null,
  cookieValue: string | null | undefined,
): ViewAs | null {
  if (realRole !== "admin") return null;
  return parseViewAs(cookieValue);
}
