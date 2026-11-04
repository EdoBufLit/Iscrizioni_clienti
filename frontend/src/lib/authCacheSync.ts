import { invalidateSwrCache } from "./swrCache";
import { clearMemberSnapshot } from "./memberSnapshot";

const AUTH_EPOCH = "assonam:auth-epoch:v1";

/** Cookies are shared across tabs; private UI must follow account changes too. */
export function publishAuthChange(): void {
  try { localStorage.setItem(AUTH_EPOCH, `${Date.now()}:${Math.random()}`); } catch { /* Storage can be disabled. */ }
}

/** Server-side magic links may establish cookies before the SPA is loaded. */
export function observeAuthIdentity(role: "member" | "org-admin" | "super-admin", id: number, orgId?: number | null): void {
  try {
    const key = `assonam:auth-identity:${role}`;
    const identity = `${id}:${orgId ?? ""}`;
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, identity);
    if (previous !== null && previous !== identity) {
      invalidateSwrCache();
      clearMemberSnapshot();
      publishAuthChange();
    }
  } catch { /* Storage can be disabled. */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", event => {
    if (event.key !== AUTH_EPOCH) return;
    invalidateSwrCache();
    clearMemberSnapshot();
    if (/^\/(?:dashboard|org-admin|super-admin)(?:\/|$)/.test(window.location.pathname)) {
      window.location.reload();
    }
  });
}
