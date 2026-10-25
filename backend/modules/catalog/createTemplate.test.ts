import { describe, expect, it } from "vitest";
import { createTemplate } from "./createTemplate";
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

describe("createTemplate", () => {
  it("inserts a template, unpublished by default, with sensible defaults", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "t1" } });

    await createTemplate(client, { name: "Classic kurta", slug: "classic-kurta" });

    expect(getInsertedWith()).toEqual({
      name: "Classic kurta",
      slug: "classic-kurta",
      description: null,
      base_stitch_price: 0,
      lead_days: 7,
      required_measurements: [],
      recommended_options: {},
      yardage_formula: {},
      is_published: false,
    });
  });

  it("passes through given fields", async () => {
    const { client, getInsertedWith } = recordingClient({ data: { id: "t1" } });

    await createTemplate(client, {
      name: "Classic kurta",
      slug: "classic-kurta",
      description: "A classic fit",
      baseStitchPrice: 1500,
      leadDays: 10,
      requiredMeasurements: [{ key: "chest", label: "Chest", unit: "cm", min: 60, max: 160 }],
      yardageFormula: { base_metres: 2.5, coefficients: { chest: 0.015 }, wastage_margin: 0.1 },
    });

    expect(getInsertedWith()).toMatchObject({
      description: "A classic fit",
      base_stitch_price: 1500,
      lead_days: 10,
      required_measurements: [{ key: "chest", label: "Chest", unit: "cm", min: 60, max: 160 }],
      yardage_formula: { base_metres: 2.5, coefficients: { chest: 0.015 }, wastage_margin: 0.1 },
    });
  });

  it("throws when the insert errors (e.g. a duplicate slug)", async () => {
    const { client } = recordingClient({ error: { message: "duplicate key value" } });

    await expect(createTemplate(client, { name: "X", slug: "x" })).rejects.toMatchObject({
      message: "duplicate key value",
    });
  });
});
