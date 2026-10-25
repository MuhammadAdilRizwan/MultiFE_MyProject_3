import { describe, expect, it } from "vitest";
import { AuthError } from "./errors";

describe("AuthError", () => {
  it("carries its code and message, and is a real Error", () => {
    const err = new AuthError("account_suspended", "This account has been suspended.");

    expect(err.code).toBe("account_suspended");
    expect(err.message).toBe("This account has been suspended.");
    expect(err.name).toBe("AuthError");
    expect(err).toBeInstanceOf(Error);
  });
});
