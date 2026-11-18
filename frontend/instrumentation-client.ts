import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "./lib/sentry-options";

// Browser errors, with the same scrubbing as the server.
Sentry.init(buildSentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
