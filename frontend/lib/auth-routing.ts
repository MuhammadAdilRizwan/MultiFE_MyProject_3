import type { AppRole } from "@multife/backend/modules/users/types";

// Where each role lands after signing in: admins, production staff and
// supplier contacts on their panel; agents and everyone else at the brands
// (agents switch to their panel from the staff bar).
export function homeForRole(role: AppRole | string | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "tailor" || role === "qc" || role === "dispatch") return "/production";
  if (role === "supplier_contact") return "/supplier";
  return "/brands";
}

// Only same-site relative paths are allowed, so a crafted ?next= link can't
// bounce a user to another domain after sign-in.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
