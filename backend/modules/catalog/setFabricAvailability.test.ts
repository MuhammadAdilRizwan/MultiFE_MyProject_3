import { describe, expect, it } from "vitest";
import { setFabricAvailability } from "./setFabricAvailability";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: {
  supportedOptions?: Record<string, string[]>;
  fetchError?: { message: string };
  updateError?: { message: string };
}) {
  const calls: { update?: unknown } = {};
  const builder: Record<string, unknown> = {
    select: () => builder,
    update: (v: unknown) => {
      calls.update = v;
      return builder;
    },
    eq: () => builder,
    single: () =>
      Promise.resolve(
        opts.fetchError
          ? { data: null, error: opts.fetchError }
          : { data: { supported_options: opts.supportedOptions ?? {} }, error: null },
      ),
    then: (onFulfilled: (v: { error: unknown }) => unknown) =>
      Promise.resolve({ error: opts.updateError ?? null }).then(onFulfilled),
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("setFabricAvailability", () => {
  it("makes a fabric available when it has at least one supported option", async () => {
    const { client, calls } = clientWith({ supportedOptions: { cuff: ["soft"] } });

    await setFabricAvailability(client, "f1", true);

    expect(calls.update).toEqual({ is_available: true });
  });

  it("FR-TPL-10: refuses to make a fabric available with no supported options", async () => {
    const { client, calls } = clientWith({ supportedOptions: {} });

    await expect(setFabricAvailability(client, "f1", true)).rejects.toMatchObject({
      code: "fabric_not_publishable",
    });
    expect(calls.update).toBeUndefined();
  });

  it("allows hiding a fabric (setting it unavailable) without checking its options", async () => {
    const { client, calls } = clientWith({ supportedOptions: {} });

    await setFabricAvailability(client, "f1", false);

    expect(calls.update).toEqual({ is_available: false });
  });

  it("throws when the fabric lookup errors", async () => {
    const { client } = clientWith({ fetchError: { message: "connection lost" } });

    await expect(setFabricAvailability(client, "f1", true)).rejects.toMatchObject({ message: "connection lost" });
  });

  it("throws when the update itself errors", async () => {
    const { client } = clientWith({ supportedOptions: { cuff: ["soft"] }, updateError: { message: "not found" } });

    await expect(setFabricAvailability(client, "f1", true)).rejects.toMatchObject({ message: "not found" });
  });
});
