import type { AppRole } from "@multife/backend/modules/users/types";

// Where each role lands after signing in. Everyone except admins starts at
// the brands (panels not built yet fall back there rather than a dead link).
export function homeForRole(role: AppRole | string | null | undefined): string {
  return role === "admin" ? "/admin" : "/brands";
}

// Only same-site relative paths are allowed, so a crafted ?next= link can't
// bounce a user to another domain after sign-in.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
