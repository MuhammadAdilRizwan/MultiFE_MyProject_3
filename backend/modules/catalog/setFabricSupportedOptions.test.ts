import { describe, expect, it } from "vitest";
import { setFabricSupportedOptions } from "./setFabricSupportedOptions";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: {
  isAvailable?: boolean;
  fetchError?: { message: string };
  updateError?: { message: string };
}) {
  const calls: { update?: unknown; fetched: boolean } = { fetched: false };
  const builder: Record<string, unknown> = {
    select: () => builder,
    update: (v: unknown) => {
      calls.update = v;
      return builder;
    },
    eq: () => builder,
    single: () => {
      calls.fetched = true;
      return Promise.resolve(
        opts.fetchError
          ? { data: null, error: opts.fetchError }
          : { data: { is_available: opts.isAvailable ?? false }, error: null },
      );
    },
    then: (onFulfilled: (v: { error: unknown }) => unknown) =>
      Promise.resolve({ error: opts.updateError ?? null }).then(onFulfilled),
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("setFabricSupportedOptions", () => {
  it("saves the verified options without checking availability", async () => {
    const { client, calls } = clientWith({ isAvailable: true });

    await setFabricSupportedOptions(client, "f1", { neckline: ["round", "v-neck"], sleeve: ["full"] });

    expect(calls.update).toEqual({ supported_options: { neckline: ["round", "v-neck"], sleeve: ["full"] } });
    expect(calls.fetched).toBe(false);
  });

  it("drops empty groups and duplicate values", async () => {
    const { client, calls } = clientWith({});

    await setFabricSupportedOptions(client, "f1", { neckline: ["round", "round"], cuff: [] });

    expect(calls.update).toEqual({ supported_options: { neckline: ["round"] } });
  });

  it("allows clearing every option on an unavailable fabric", async () => {
    const { client, calls } = clientWith({ isAvailable: false });

    await setFabricSupportedOptions(client, "f1", { cuff: [] });

    expect(calls.update).toEqual({ supported_options: {} });
  });

  it("FR-TPL-10: refuses to clear every option while the fabric is available", async () => {
    const { client, calls } = clientWith({ isAvailable: true });

    await expect(setFabricSupportedOptions(client, "f1", {})).rejects.toMatchObject({
      code: "fabric_not_publishable",
    });
    expect(calls.update).toBeUndefined();
  });

  it("throws when the availability lookup errors", async () => {
    const { client } = clientWith({ fetchError: { message: "connection lost" } });

    await expect(setFabricSupportedOptions(client, "f1", {})).rejects.toMatchObject({ message: "connection lost" });
  });

  it("throws when the update itself errors", async () => {
    const { client } = clientWith({ updateError: { message: "not found" } });

    await expect(setFabricSupportedOptions(client, "f1", { cuff: ["soft"] })).rejects.toMatchObject({
      message: "not found",
    });
  });
});
