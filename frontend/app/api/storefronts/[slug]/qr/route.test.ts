import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/active-admin", () => ({ activeAdmin: vi.fn() }));

import { activeAdmin } from "@/lib/active-admin";
import { GET } from "./route";

function adminWithStore(found: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: found ? { slug: "khadi" } : null, error: null });
  const chain = { select: () => chain, eq: () => chain, maybeSingle };
  return { supabase: { from: () => chain }, adminId: "a1" };
}

const call = (slug: string, query = "") =>
  GET(new NextRequest(`http://localhost/api/storefronts/${slug}/qr${query}`), { params: Promise.resolve({ slug }) });

describe("GET /api/storefronts/[slug]/qr", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://multife.pk"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuses non-admins and odd slugs", async () => {
    vi.mocked(activeAdmin).mockResolvedValue(null);
    expect((await call("khadi")).status).toBe(401);
    expect((await call("..%2Fadmin")).status).toBe(404);
  });

  it("404s for a store that doesn't exist", async () => {
    vi.mocked(activeAdmin).mockResolvedValue(adminWithStore(false) as never);
    expect((await call("nope")).status).toBe(404);
  });

  it("returns a PNG by default and an SVG on request", async () => {
    vi.mocked(activeAdmin).mockResolvedValue(adminWithStore(true) as never);
    const png = await call("khadi", "?download=1");
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("content-disposition")).toContain("multife-khadi-qr.png");
    const bytes = new Uint8Array(await png.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");

    const svg = await call("khadi", "?format=svg");
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
  });

  it("needs the site address to build the link", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.mocked(activeAdmin).mockResolvedValue(adminWithStore(true) as never);
    expect((await call("khadi")).status).toBe(503);
  });
});
