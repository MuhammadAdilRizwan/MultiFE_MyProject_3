import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { buildContentSecurityPolicy, securityHeaders } from "./security-headers";

const SUPABASE = "https://abc123.supabase.co";

function header(headers: { key: string; value: string }[], key: string) {
  return headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

describe("securityHeaders", () => {
  const headers = securityHeaders({ supabaseUrl: SUPABASE, isDev: false });

  it("refuses to be framed", () => {
    expect(header(headers, "X-Frame-Options")).toBe("DENY");
  });

  it("forces HTTPS for two years including subdomains", () => {
    expect(header(headers, "Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
  });

  it("stops MIME sniffing and trims the referrer", () => {
    expect(header(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("allows the camera for this site only (the sizing scan) and nothing else sensitive", () => {
    expect(header(headers, "Permissions-Policy")).toBe("camera=(self), microphone=(), geolocation=()");
  });

  it("ships the CSP as report-only for now, so it can't break the order flow", () => {
    expect(header(headers, "Content-Security-Policy-Report-Only")).toBeDefined();
    expect(header(headers, "Content-Security-Policy")).toBeUndefined();
  });
});

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy({ supabaseUrl: SUPABASE, isDev: false });

  it("only allows the site itself by default", () => {
    expect(csp).toContain("default-src 'self'");
  });

  it("blocks framing, plugins and rebasing, and keeps forms on-site", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("lets the browser talk to this Supabase project, over https and realtime websockets", () => {
    expect(csp).toContain(`connect-src 'self' ${SUPABASE} wss://abc123.supabase.co`);
  });

  it("lets storefront images load from Supabase storage", () => {
    expect(csp).toMatch(/img-src 'self' data: blob: https:\/\/abc123\.supabase\.co/);
  });

  it("does not allow eval in production", () => {
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in dev, where React needs it", () => {
    expect(buildContentSecurityPolicy({ supabaseUrl: SUPABASE, isDev: true })).toContain("'unsafe-eval'");
  });

  it("lets the browser report errors to Sentry when a DSN is set, and not otherwise", () => {
    const withSentry = buildContentSecurityPolicy({ supabaseUrl: SUPABASE, isDev: false, sentryDsn: "https://key@o123.ingest.sentry.io/456" });
    expect(withSentry).toContain("connect-src 'self'");
    expect(withSentry).toContain("https://o123.ingest.sentry.io");
    expect(withSentry).not.toContain("key@");
    expect(csp).not.toContain("sentry");
  });

  it("ignores a Sentry DSN that isn't a valid URL", () => {
    expect(buildContentSecurityPolicy({ supabaseUrl: SUPABASE, isDev: false, sentryDsn: "not a dsn" })).not.toContain("undefined");
  });

  it("still builds a valid policy when no Supabase URL is configured", () => {
    const bare = buildContentSecurityPolicy({ supabaseUrl: undefined, isDev: false });
    expect(bare).toContain("connect-src 'self'");
    expect(bare).not.toContain("undefined");
  });
});

describe("next.config", () => {
  it("applies the security headers to every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/(.*)");
    expect(all).toBeDefined();
    expect(header(all!.headers, "X-Frame-Options")).toBe("DENY");
  });
});
