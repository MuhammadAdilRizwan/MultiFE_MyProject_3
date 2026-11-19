import type { AnySupabaseClient, SupplierContact } from "./types";

type Raw = {
  user_id: string;
  created_at: string;
  profile: { full_name: string | null; email: string | null; status: SupplierContact["status"] } | null;
};

// Who can sign in to the supplier panel for a store (FR-AUTH-03: contacts
// join by admin invite). Admin session: "supplier_contacts: admin all" and
// "profiles: admin all". Oldest first.
export async function listSupplierContacts(supabase: AnySupabaseClient, supplierId: string): Promise<SupplierContact[]> {
  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("user_id, created_at, profile:profiles(full_name, email, status)")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    userId: r.user_id,
    fullName: r.profile?.full_name ?? null,
    email: r.profile?.email ?? null,
    status: r.profile?.status ?? "active",
    linkedAt: r.created_at,
  }));
}
