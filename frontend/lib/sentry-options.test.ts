import { describe, expect, it } from "vitest";
import { buildSentryOptions } from "./sentry-options";

const DSN = "https://key@o123.ingest.sentry.io/456";

describe("buildSentryOptions", () => {
  it("stays off until a DSN is configured", () => {
    expect(buildSentryOptions(undefined).enabled).toBe(false);
    expect(buildSentryOptions("").enabled).toBe(false);
  });

  it("turns on with a DSN", () => {
    const options = buildSentryOptions(DSN);
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe(DSN);
  });

  it("does no performance tracing", () => {
    expect(buildSentryOptions(DSN).tracesSampleRate).toBe(0);
  });

  it("switches off every automatic data collection that could carry personal data", () => {
    // The SDK's defaults collect cookies, headers, bodies, query strings, user
    // info and local variables from stack frames; none of that may leave.
    expect(buildSentryOptions(DSN).dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    });
  });

  it("scrubs every event before it leaves the app", () => {
    const sent = buildSentryOptions(DSN).beforeSend!({
      user: { email: "a@x.com" },
      request: { data: { password: "x" } },
    } as never, {} as never) as { user?: unknown; request?: { data?: unknown } };

    expect(sent.user).toBeUndefined();
    expect(sent.request?.data).toBeUndefined();
  });

  it("strips data from breadcrumbs", () => {
    const crumb = buildSentryOptions(DSN).beforeBreadcrumb!({ category: "fetch", data: { url: "/x?email=a@x.com" } } as never, undefined);
    expect(crumb).toEqual({ category: "fetch" });
  });
});
