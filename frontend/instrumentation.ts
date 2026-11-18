import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "./lib/sentry-options";

// Runs once when the server (Node or Edge) starts.
export function register() {
  Sentry.init(buildSentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
}

// Reports errors thrown while rendering pages and in route handlers.
export const onRequestError = Sentry.captureRequestError;
