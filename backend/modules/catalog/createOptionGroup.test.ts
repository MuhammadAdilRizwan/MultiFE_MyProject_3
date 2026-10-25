import { describe, expect, it } from "vitest";
import { createOptionGroup } from "./createOptionGroup";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let insertedWith: unknown;
  const builder: Record<string, unknown> = {
    insert: (v: unknown) => {
      insertedWith = v;
      return builder;
    },
    select: () => builder,
    single: () => Promise.resolve(value),
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getInsertedWith: () => insertedWith };
}

describe("createOptionGroup", () => {
  it("inserts the group with sort defaulting to 0", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "g1", key: "cuff", label: "Cuff", sort: 0 } });

    const result = await createOptionGroup(client, { key: "cuff", label: "Cuff" });

    expect(getInsertedWith()).toEqual({ key: "cuff", label: "Cuff", sort: 0 });
    expect(result.key).toBe("cuff");
  });

  it("passes through a given sort", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "g1" } });

    await createOptionGroup(client, { key: "cuff", label: "Cuff", sort: 3 });

    expect(getInsertedWith()).toEqual({ key: "cuff", label: "Cuff", sort: 3 });
  });

  it("throws when the insert errors (e.g. a duplicate key)", async () => {
    const { client } = recordingClient({ error: { message: "duplicate key value" } });

    await expect(createOptionGroup(client, { key: "cuff", label: "Cuff" })).rejects.toMatchObject({
      message: "duplicate key value",
    });
  });
});
