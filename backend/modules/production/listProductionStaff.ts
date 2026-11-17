import type { AnySupabaseClient } from "./types";

export interface ProductionStaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "tailor" | "qc";
}

// Active tailors and QC staff a job can be assigned to (FR-PRD-05). Admin
// session: "profiles: admin all" lets the rows through.
export async function listProductionStaff(supabase: AnySupabaseClient): Promise<ProductionStaffRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["tailor", "qc"])
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductionStaffRow[];
}
