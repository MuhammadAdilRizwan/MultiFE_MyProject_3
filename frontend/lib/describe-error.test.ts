<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@multife/backend/modules/users/errors";
import { CatalogError } from "@multife/backend/modules/catalog/errors";
import { OrderNotCancellableError } from "@multife/backend/modules/orders/cancelOrder";
import * as Sentry from "@sentry/nextjs";
import { describeError, GENERIC_ERROR } from "./describe-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
=======
import { describe, expect, it } from "vitest";
import { describeError, logMessage } from "./describe-error";
>>>>>>> a076bc5cf821bf5dc895dd8a89f28dd313893b49

describe("describeError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Sentry.captureException).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the message of the app's own error classes", () => {
    expect(describeError(new AuthError("not_authorized", "Only an admin can send invites."))).toBe("Only an admin can send invites.");
    expect(describeError(new CatalogError("fabric_not_publishable", "Add option data first."))).toBe("Add option data first.");
    expect(describeError(new OrderNotCancellableError("too_late"))).toBe("This order can no longer be cancelled");
  });

  it("hides the message of an unexpected Error", () => {
    expect(describeError(new Error('duplicate key value violates unique constraint "suppliers_slug_key"'))).toBe(GENERIC_ERROR);
  });

  it("hides database constraint errors", () => {
    expect(describeError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' })).toBe(GENERIC_ERROR);
  });

  it("hides a native permission-denied error even though its code (42501) is one the app raises itself", () => {
    expect(describeError({ code: "42501", message: "permission denied for function fn_take_hard_reservation" })).toBe(GENERIC_ERROR);
  });

  it("shows the app's own database rule messages", () => {
    expect(describeError({ code: "22023", message: "Not enough fabric in stock" })).toBe("Not enough fabric in stock");
    expect(describeError({ code: "42501", message: "Only an admin can fail an order" })).toBe("Only an admin can fail an order");
    expect(describeError({ code: "P0002", message: "Order not found" })).toBe("Order not found");
  });

  it("shows why a password was refused, and gives a friendly message for rate limiting", () => {
    expect(describeError({ code: "weak_password", message: "Password should be at least 8 characters." })).toBe(
      "Password should be at least 8 characters.",
    );
    expect(describeError({ code: "over_request_rate_limit", message: "Request rate limit reached" })).toBe(
      "Too many attempts. Please wait a minute and try again.",
    );
  });

  it("falls back to the generic message for anything that isn't an error", () => {
    expect(describeError("just a string")).toBe(GENERIC_ERROR);
    expect(describeError(null)).toBe(GENERIC_ERROR);
  });

  it("reports an unexpected error to Sentry, since the action would otherwise swallow it", () => {
    const error = new Error("boom");
    describeError(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("does not report errors that are expected and shown to the user", () => {
    describeError(new AuthError("not_authorized", "Only an admin can send invites."));
    describeError({ code: "22023", message: "Not enough fabric in stock" });
    describeError({ code: "weak_password", message: "Password should be at least 8 characters." });
    describeError({ code: "over_request_rate_limit", message: "Request rate limit reached" });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("logs only the error's name or code, never its message", () => {
    describeError(new Error("secret@example.com is not allowed"));
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("secret@example.com");
  });
});

describe("logMessage", () => {
  it("reads Errors and Supabase's plain error objects", () => {
    expect(logMessage(new Error("boom"))).toBe("boom");
    expect(logMessage({ message: "permission denied for function x", code: "42501", details: null })).toBe(
      "permission denied for function x (42501)",
    );
    expect(logMessage({ message: "no code" })).toBe("no code");
    expect(logMessage("text")).toBe("unknown error");
    expect(logMessage(null)).toBe("unknown error");
  });
});
