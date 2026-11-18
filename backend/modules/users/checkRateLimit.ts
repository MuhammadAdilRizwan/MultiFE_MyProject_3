import type { AnySupabaseClient } from "./types";

export interface CheckRateLimitParams {
  key: string;
  limit: number;
  windowSeconds: number;
}

// Counts this attempt against `key` and says whether it's allowed (true) or
// the limit within the window has been reached (false). Thin RPC wrapper over
// fn_rate_limit_check, which is service-role only: pass the admin client.
export async function checkRateLimit(
  supabase: AnySupabaseClient,
  { key, limit, windowSeconds }: CheckRateLimitParams,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("fn_rate_limit_check", {
    p_key: key,
    p_limit: limit,
    p_window: `${windowSeconds} seconds`,
  });
  if (error) throw error;

  return data === true;
}
