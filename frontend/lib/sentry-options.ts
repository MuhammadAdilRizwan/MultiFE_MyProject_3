import type * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

// Shared by the browser, server and edge Sentry setups. Errors only: no
// performance tracing, no session replay, no automatic data collection, and every
// event and breadcrumb is scrubbed (see sentry-scrub.ts) before it is sent.
// Off until NEXT_PUBLIC_SENTRY_DSN is set.
export function buildSentryOptions(dsn: string | undefined): NonNullable<Parameters<typeof Sentry.init>[0]> {
  return {
    dsn,
    enabled: Boolean(dsn),
    // Sentry's defaults collect cookies, headers, request bodies, query
    // strings, user info and local variables from stack frames. Turn it all off.
    dataCollection: {
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
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event as never) as typeof event,
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb as never) as typeof breadcrumb,
  };
}
