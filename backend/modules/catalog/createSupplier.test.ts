import { describe, expect, it } from "vitest";
import { createSupplier } from "./createSupplier";
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

describe("createSupplier", () => {
  it("inserts the supplier with an empty contact object by default", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "s1", name: "Khadi", slug: "khadi", status: "pending" } });

    const result = await createSupplier(client, { name: "Khadi", slug: "khadi" });

    expect(getInsertedWith()).toEqual({ name: "Khadi", slug: "khadi", contact: {} });
    expect(result).toEqual({ id: "s1", name: "Khadi", slug: "khadi", status: "pending" });
  });

  it("passes through a given contact object", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "s1" } });

    await createSupplier(client, { name: "Khadi", slug: "khadi", contact: { email: "ops@khadi.test" } });

    expect(getInsertedWith()).toEqual({ name: "Khadi", slug: "khadi", contact: { email: "ops@khadi.test" } });
  });

  it("throws when the insert errors (e.g. a duplicate slug)", async () => {
    const { client } = recordingClient({ error: { message: "duplicate key value violates unique constraint" } });

    await expect(createSupplier(client, { name: "Khadi", slug: "khadi" })).rejects.toMatchObject({
      message: "duplicate key value violates unique constraint",
    });
  });
});
