import { describe, expect, it } from "vitest";
import { homeForRole, safeNextPath } from "./auth-routing";

describe("homeForRole", () => {
  it("sends admins and agents to their panels", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("agent")).toBe("/agent");
  });

  it("sends customers and roles without a panel yet to the brands", () => {
    expect(homeForRole("customer")).toBe("/brands");
    expect(homeForRole("tailor")).toBe("/brands");
    expect(homeForRole(null)).toBe("/brands");
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/order/review")).toBe("/order/review");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
