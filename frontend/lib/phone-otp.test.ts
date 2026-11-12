import { describe, expect, it } from "vitest";
import { phoneOtpMessage } from "./phone-otp";

describe("phoneOtpMessage", () => {
  it("explains when phone sign-in isn't enabled on the project", () => {
    expect(phoneOtpMessage("Unsupported phone provider", "send")).toMatch(/isn't switched on yet/);
    expect(phoneOtpMessage("Phone signups are disabled", "send")).toMatch(/isn't switched on yet/);
  });

  it("explains an unknown number (accounts are made by agents, not here)", () => {
    expect(phoneOtpMessage("Signups not allowed for otp", "send")).toMatch(/couldn't find an account/);
  });

  it("explains rate limits and bad codes", () => {
    expect(phoneOtpMessage("For security purposes, you can only request this after 42 seconds.", "send")).toMatch(/wait a minute/);
    expect(phoneOtpMessage("Token has expired or is invalid", "verify")).toMatch(/wrong or has expired/);
  });

  it("falls back to a generic message per step", () => {
    expect(phoneOtpMessage("boom", "send")).toBe("We couldn't send a code right now. Please try again.");
    expect(phoneOtpMessage("boom", "verify")).toBe("We couldn't check that code. Please try again.");
  });
});
