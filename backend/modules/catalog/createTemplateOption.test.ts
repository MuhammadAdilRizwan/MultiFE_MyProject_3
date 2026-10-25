import { describe, expect, it } from "vitest";
import { createTemplateOption } from "./createTemplateOption";
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

describe("createTemplateOption", () => {
  it("inserts with price_delta=0, extra_lead_days=0, is_default=false by default", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "o1" } });

    await createTemplateOption(client, { templateId: "t1", groupId: "g1", valueId: "v1" });

    expect(getInsertedWith()).toEqual({
      template_id: "t1",
      group_id: "g1",
      value_id: "v1",
      price_delta: 0,
      extra_lead_days: 0,
      is_default: false,
    });
  });

  it("passes through given price_delta, extra_lead_days and is_default", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "o1" } });

    await createTemplateOption(client, {
      templateId: "t1",
      groupId: "g1",
      valueId: "v1",
      priceDelta: 500,
      extraLeadDays: 2,
      isDefault: true,
    });

    expect(getInsertedWith()).toEqual({
      template_id: "t1",
      group_id: "g1",
      value_id: "v1",
      price_delta: 500,
      extra_lead_days: 2,
      is_default: true,
    });
  });

  it("throws when the insert errors (e.g. the value doesn't belong to the group)", async () => {
    const { client } = recordingClient({ error: { message: "foreign key violation" } });

    await expect(
      createTemplateOption(client, { templateId: "t1", groupId: "g1", valueId: "v1" }),
    ).rejects.toMatchObject({ message: "foreign key violation" });
  });
});
