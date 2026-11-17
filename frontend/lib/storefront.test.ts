import { describe, expect, it } from "vitest";
import { storefrontUrl } from "./storefront";

describe("storefrontUrl", () => {
  it("builds the brand page address on the site's domain", () => {
    expect(storefrontUrl("gul-ahmed", "https://multife.pk")).toBe("https://multife.pk/s/gul-ahmed");
    expect(storefrontUrl("khadi", "https://multife.pk/")).toBe("https://multife.pk/s/khadi");
  });

  it("refuses odd slugs and a missing site address", () => {
    expect(storefrontUrl("../admin", "https://multife.pk")).toBeNull();
    expect(storefrontUrl("Gul Ahmed", "https://multife.pk")).toBeNull();
    expect(storefrontUrl("khadi", "")).toBeNull();
    expect(storefrontUrl("khadi", "not a url")).toBeNull();
  });
});
