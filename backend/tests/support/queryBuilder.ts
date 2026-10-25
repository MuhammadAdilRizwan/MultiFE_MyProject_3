// Minimal stand-in for a Supabase Postgrest query builder: chainable
// (.select/.update/.insert/.eq all return itself) and awaitable directly
// (via `.then`), matching how the real builder resolves `{ data, error }`
// both through a terminal call like `.single()` and when awaited with no
// terminal call at all (e.g. `await supabase.from(t).update(x).eq(y, z)`).
export function queryBuilder(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };

  const builder: Record<string, unknown> = {
    select: () => builder,
    update: () => builder,
    insert: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(value),
    maybeSingle: () => Promise.resolve(value),
    then: (onFulfilled: (v: typeof value) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
  };

  return builder;
}
