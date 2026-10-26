import { describe, expect, it } from "vitest";
import { getDraft } from "./getDraft";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let filteredId: unknown;
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (_col: string, v: unknown) => {
      filteredId = v;
      return builder;
    },
    maybeSingle: () => Promise.resolve(value),
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getFilteredId: () => filteredId };
}

describe("getDraft", () => {
  it("returns the draft by id", async () => {
    const { client, getFilteredId } = recordingClient({ data: { id: "d1", step: "fabric" } });

    const draft = await getDraft(client, "d1");

    expect(getFilteredId()).toBe("d1");
    expect(draft).toEqual({ id: "d1", step: "fabric" });
  });

  it("returns null when the draft doesn't exist", async () => {
    const { client } = recordingClient({ data: null });

    expect(await getDraft(client, "missing")).toBeNull();
  });

  it("throws when the read errors", async () => {
    const { client } = recordingClient({ error: { message: "connection lost" } });

    await expect(getDraft(client, "d1")).rejects.toMatchObject({ message: "connection lost" });
  });
});
