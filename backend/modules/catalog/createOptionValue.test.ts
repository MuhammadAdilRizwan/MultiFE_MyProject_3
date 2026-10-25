import { describe, expect, it } from "vitest";
import { createOptionValue } from "./createOptionValue";
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

describe("createOptionValue", () => {
  it("inserts the value with imageUrl and sort defaulted", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "v1" } });

    await createOptionValue(client, { groupId: "g1", key: "soft", label: "Soft" });

    expect(getInsertedWith()).toEqual({ group_id: "g1", key: "soft", label: "Soft", image_url: null, sort: 0 });
  });

  it("passes through given imageUrl and sort", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "v1" } });

    await createOptionValue(client, {
      groupId: "g1",
      key: "soft",
      label: "Soft",
      imageUrl: "https://x/soft.png",
      sort: 2,
    });

    expect(getInsertedWith()).toEqual({
      group_id: "g1",
      key: "soft",
      label: "Soft",
      image_url: "https://x/soft.png",
      sort: 2,
    });
  });

  it("throws when the insert errors (e.g. a duplicate key within the group)", async () => {
    const { client } = recordingClient({ error: { message: "duplicate key value" } });

    await expect(createOptionValue(client, { groupId: "g1", key: "soft", label: "Soft" })).rejects.toMatchObject({
      message: "duplicate key value",
    });
  });
});
