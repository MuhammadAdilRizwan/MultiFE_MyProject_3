import { describe, expect, it } from "vitest";
import { describeError, logMessage } from "./describe-error";

describe("describeError", () => {
  it("returns the message of any Error (including subclasses like AuthError/CatalogError)", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    class CustomError extends Error {}
    expect(describeError(new CustomError("custom boom"))).toBe("custom boom");
  });

  it("falls back to a generic message for a non-Error throw", () => {
    expect(describeError("just a string")).toBe("Something went wrong.");
    expect(describeError(null)).toBe("Something went wrong.");
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
