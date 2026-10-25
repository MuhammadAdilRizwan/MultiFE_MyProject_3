import { describe, expect, it } from "vitest";
import { getFabric } from "./getFabric";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: {
  fabric?: Record<string, unknown> | null;
  fabricError?: { message: string };
  images?: Array<{ id: string; url: string; sort: number }>;
  imagesError?: { message: string };
}) {
  const builders: Record<string, Record<string, unknown>> = {
    fabrics: {
      select: () => builders.fabrics,
      eq: () => builders.fabrics,
      maybeSingle: () =>
        Promise.resolve(
          opts.fabricError ? { data: null, error: opts.fabricError } : { data: opts.fabric ?? null, error: null },
        ),
    },
    fabric_images: {
      select: () => builders.fabric_images,
      eq: () => builders.fabric_images,
      order: () =>
        Promise.resolve(
          opts.imagesError ? { data: null, error: opts.imagesError } : { data: opts.images ?? [], error: null },
        ),
    },
  };
  const client = { from: (table: string) => builders[table] };
  return client as unknown as AnySupabaseClient;
}

describe("getFabric", () => {
  it("returns null when the fabric doesn't exist (or isn't visible under RLS)", async () => {
    const client = clientWith({ fabric: null });

    await expect(getFabric(client, "missing")).resolves.toBeNull();
  });

  it("returns the fabric with its images, sorted", async () => {
    const client = clientWith({
      fabric: { id: "f1", name: "Raw silk" },
      images: [
        { id: "i1", url: "https://x/1.jpg", sort: 0 },
        { id: "i2", url: "https://x/2.jpg", sort: 1 },
      ],
    });

    const result = await getFabric(client, "f1");

    expect(result?.name).toBe("Raw silk");
    expect(result?.images).toHaveLength(2);
    expect(result?.images[0].url).toBe("https://x/1.jpg");
  });

  it("returns an empty images array when the fabric has none", async () => {
    const client = clientWith({ fabric: { id: "f1", name: "Raw silk" }, images: [] });

    const result = await getFabric(client, "f1");

    expect(result?.images).toEqual([]);
  });

  it("throws when the fabric lookup errors", async () => {
    const client = clientWith({ fabricError: { message: "connection lost" } });

    await expect(getFabric(client, "f1")).rejects.toMatchObject({ message: "connection lost" });
  });

  it("throws when the images lookup errors", async () => {
    const client = clientWith({ fabric: { id: "f1", name: "Raw silk" }, imagesError: { message: "connection lost" } });

    await expect(getFabric(client, "f1")).rejects.toMatchObject({ message: "connection lost" });
  });
});
