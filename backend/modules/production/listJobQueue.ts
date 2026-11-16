import type { AnySupabaseClient, ProductionJobRow } from "./types";

// Reads through the user's own RLS-scoped client — relies on
// "production_jobs: assigned staff" (assigned_to_id = auth.uid()) to limit
// this to the caller's own queue. Highest priority first, then oldest first
// within the same priority.
export async function listJobQueue(
  supabase: AnySupabaseClient,
  assignedToId: string,
): Promise<ProductionJobRow[]> {
  const { data, error } = await supabase
    .from("production_jobs")
    .select("id, order_id, assigned_to_id, stage, started_at, finished_at, priority")
    .eq("assigned_to_id", assignedToId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []) as unknown as ProductionJobRow[];
}
