import type { AgentRow, AnySupabaseClient } from "./types";

// Reads the caller's own agents row. agent_customers.agent_id (and every
// other agent-scoping check) uses agents.id, not the profile/auth id, so
// this translation is needed before any agent-facing action can scope by it.
export async function getCurrentAgent(
  supabase: AnySupabaseClient,
): Promise<AgentRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("agents")
    .select("id, profile_id, code, region, status")
    .eq("profile_id", auth.user.id)
    .maybeSingle();

  if (error) throw error;
  return data as AgentRow | null;
}
