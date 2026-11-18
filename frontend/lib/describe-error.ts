import * as Sentry from "@sentry/nextjs";
import { CatalogError } from "@multife/backend/modules/catalog/errors";
import { OrderNotCancellableError } from "@multife/backend/modules/orders/cancelOrder";
import { AuthError } from "@multife/backend/modules/users/errors";

export const GENERIC_ERROR = "Something went wrong. Please try again.";

// SQLSTATEs our own SQL functions raise on purpose (`raise exception ... using
// errcode`) — their messages are written for people ("Not enough fabric in
// stock"). Postgres raises the same codes natively, though (42501 is also
// "permission denied for function ..."), hence the pattern check below.
const APP_RULE_CODES = new Set(["22023", "42501", "P0001", "P0002"]);
const NATIVE_DB_MESSAGE = /permission denied|violates|duplicate key|does not exist|relation |column |schema |syntax|invalid input|null value/i;

type ErrorLike = { code?: unknown; message?: unknown; name?: unknown };

// What a caller may be shown for a thrown error. Only the app's own errors,
// its own database rules and a couple of Supabase Auth codes get through;
// everything else (constraint names, table names, Supabase internals) becomes
// a generic message, and only the error's name/code — never its message,
// which can hold an email or a measurement — is logged.
export function describeError(error: unknown): string {
  if (error instanceof AuthError || error instanceof CatalogError || error instanceof OrderNotCancellableError) {
    return error.message;
  }

  const { code, message, name } = (error && typeof error === "object" ? error : {}) as ErrorLike;

  if (typeof message === "string" && typeof code === "string") {
    if (code === "weak_password") return message;
    if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || code === "over_sms_send_rate_limit") {
      return "Too many attempts. Please wait a minute and try again.";
    }
    if (APP_RULE_CODES.has(code) && !NATIVE_DB_MESSAGE.test(message)) return message;
  }

  // Unexpected: the action turns it into a generic message, so without this
  // it would never reach error monitoring. The Sentry config scrubs it first.
  Sentry.captureException(error);
  console.error("action failed:", typeof code === "string" ? code : typeof name === "string" ? name : "unknown error");
  return GENERIC_ERROR;
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
