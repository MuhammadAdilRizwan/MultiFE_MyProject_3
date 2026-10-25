import { describe, expect, it } from "vitest";
import { describeError } from "./describe-error";

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
