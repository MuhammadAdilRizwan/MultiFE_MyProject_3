import { describe, expect, it } from "vitest";
import { CatalogError } from "./errors";

describe("CatalogError", () => {
  it("carries its code and message, and is a real Error", () => {
    const err = new CatalogError("fabric_not_publishable", "Fabric f1 has no supported options.");

    expect(err.code).toBe("fabric_not_publishable");
    expect(err.message).toBe("Fabric f1 has no supported options.");
    expect(err.name).toBe("CatalogError");
    expect(err).toBeInstanceOf(Error);
  });
});
