import { describe, expect, it } from "vitest";
import { createDraft } from "./createDraft";
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

describe("createDraft", () => {
  it("inserts a draft with empty options and step 'fabric'", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "d1" } });

    await createDraft(client, { customerId: "c1", fabricId: "f1", templateId: "t1" });

    expect(getInsertedWith()).toEqual({
      customer_id: "c1",
      fabric_id: "f1",
      template_id: "t1",
      options: {},
      step: "fabric",
    });
  });

  it("returns the inserted row", async () => {
    const { client } = recordingClient({ data: { id: "d1", customer_id: "c1" } });

    const draft = await createDraft(client, { customerId: "c1", fabricId: "f1", templateId: "t1" });

    expect(draft).toEqual({ id: "d1", customer_id: "c1" });
  });

  it("throws when the insert errors", async () => {
    const { client } = recordingClient({ error: { message: "fabric_id violates foreign key" } });

    await expect(
      createDraft(client, { customerId: "c1", fabricId: "bad", templateId: "t1" }),
    ).rejects.toMatchObject({ message: "fabric_id violates foreign key" });
  });
});
