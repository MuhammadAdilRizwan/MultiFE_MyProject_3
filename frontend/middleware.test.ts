import { describe, expect, it } from "vitest";
import { matchGuard } from "./middleware";

describe("matchGuard", () => {
  it("leaves the storefront, order flow and auth pages unguarded", () => {
    expect(matchGuard("/")).toBeUndefined();
    expect(matchGuard("/s/khadi")).toBeUndefined();
    expect(matchGuard("/order/measure")).toBeUndefined();
    expect(matchGuard("/auth/sign-in")).toBeUndefined();
  });

  it("guards /account for customers only", () => {
    expect(matchGuard("/account")?.roles).toEqual(["customer"]);
    expect(matchGuard("/account/orders")?.roles).toEqual(["customer"]);
  });

  it("guards /agent for agents only", () => {
    expect(matchGuard("/agent")?.roles).toEqual(["agent"]);
  });

  it("guards /production for tailor, qc and dispatch", () => {
    expect(matchGuard("/production/queue")?.roles).toEqual(["tailor", "qc", "dispatch"]);
  });

  it("guards /supplier for supplier_contact only", () => {
    expect(matchGuard("/supplier/fabrics")?.roles).toEqual(["supplier_contact"]);
  });

  it("guards /admin for admin only", () => {
    expect(matchGuard("/admin/users")?.roles).toEqual(["admin"]);
  });

  it("does not guard a path that merely starts with a protected prefix's text", () => {
    // /accountant should not match the /account guard
    expect(matchGuard("/accountant")).toBeUndefined();
  });
});
