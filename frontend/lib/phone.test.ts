import { describe, expect, it } from "vitest";
import { formatPhone, toInternationalPhone } from "./phone";

describe("toInternationalPhone", () => {
  it.each([
    ["03001234567", "+923001234567"],
    ["0300 1234567", "+923001234567"],
    ["0300-123-4567", "+923001234567"],
    ["3001234567", "+923001234567"],
    ["923001234567", "+923001234567"],
    ["00923001234567", "+923001234567"],
    ["+92 300 1234567", "+923001234567"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("reads %s as %s", (input, expected) => {
    expect(toInternationalPhone(input)).toBe(expected);
  });

  it.each(["", "abc", "0300123", "+0300123456789", "12345"])("rejects %s", (input) => {
    expect(toInternationalPhone(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("spaces a Pakistani number", () => {
    expect(formatPhone("+923001234567")).toBe("+92 300 1234567");
  });

  it("adds the + Supabase leaves off stored phones", () => {
    expect(formatPhone("923001234567")).toBe("+92 300 1234567");
  });

  it("leaves other numbers as they are", () => {
    expect(formatPhone("+442079460958")).toBe("+442079460958");
    expect(formatPhone(null)).toBe("");
  });
});
