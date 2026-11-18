type Options = { supabaseUrl: string | undefined; isDev: boolean; sentryDsn?: string };

// The ingest origin from a Sentry DSN (https://<key>@<host>/<project>), so the
// browser may report errors there. Never includes the key.
function sentryOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const { protocol, host } = new URL(dsn);
    return protocol === "https:" ? `https://${host}` : null;
  } catch {
    return null;
  }
}

// Content-Security-Policy for the whole site. Scripts and styles allow
// 'unsafe-inline' because Next injects inline bootstrap scripts; moving to
// per-request nonces is the follow-up that would let that go.
export function buildContentSecurityPolicy({ supabaseUrl, isDev, sentryDsn }: Options): string {
  const sentry = sentryOrigin(sentryDsn);
  const supabase = supabaseUrl ? [supabaseUrl, supabaseUrl.replace(/^https:/, "wss:")] : [];

  return [
    "default-src 'self'",
    // React's dev tooling needs eval; production never does.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${["'self'", "data:", "blob:", ...(supabaseUrl ? [supabaseUrl] : [])].join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${["'self'", ...supabase, ...(sentry ? [sentry] : [])].join(" ")}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function securityHeaders(options: Options): { key: string; value: string }[] {
  return [
    // Report-only until a week of real browsing shows nothing legitimate is
    // blocked; then rename the key to Content-Security-Policy to enforce it.
    { key: "Content-Security-Policy-Report-Only", value: buildContentSecurityPolicy(options) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Camera is for the AI sizing scan; nothing else sensitive is needed.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ];
}
