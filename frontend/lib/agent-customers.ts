import type { AssignedCustomerRow } from "@multife/backend/modules/agents/types";

// How an agent's customer is named and searched in the agent panel and the
// order flow's customer picker.
export function customerLabel(c: { full_name: string | null; email: string | null } | null | undefined): string {
  return c?.full_name?.trim() || c?.email || "Unnamed customer";
}

export function matchesCustomer(row: AssignedCustomerRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, "");
  const name = (row.customer?.full_name ?? "").toLowerCase();
  const email = (row.customer?.email ?? "").toLowerCase();
  const phone = (row.customer?.phone ?? "").replace(/\D/g, "");
  return name.includes(q) || email.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits.replace(/^0/, "")));
}
