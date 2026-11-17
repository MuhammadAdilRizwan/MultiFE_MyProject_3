export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

// For server logs only (never shown to users): the error's own message,
// including Supabase/PostgREST errors, which are plain objects rather than
// Error instances. Database messages don't carry customer data.
export function logMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    const e = error as { message: string; code?: unknown };
    return typeof e.code === "string" ? `${e.message} (${e.code})` : e.message;
  }
  return "unknown error";
}
