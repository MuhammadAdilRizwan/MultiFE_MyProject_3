import { describe, expect, it } from "vitest";
import { updateTemplate } from "./updateTemplate";
import type { AnySupabaseClient } from "./types";

function recordingClient(error: { message: string } | null = null) {
  const calls: { update?: unknown; eq?: [string, unknown] } = {};
  const builder: Record<string, unknown> = {
    update: (v: unknown) => {
      calls.update = v;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      calls.eq = [col, val];
      return Promise.resolve({ error });
    },
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, calls };
}

describe("updateTemplate", () => {
  it("updates only the given fields", async () => {
    const { client, calls } = recordingClient();

    await updateTemplate(client, "t1", { baseStitchPrice: 2000 });

    expect(calls.update).toEqual({ base_stitch_price: 2000 });
    expect(calls.eq).toEqual(["id", "t1"]);
  });

  it("maps every supported field to its column name", async () => {
    const { client, calls } = recordingClient();

    await updateTemplate(client, "t1", {
      name: "Classic kurta v2",
      description: "Updated",
      leadDays: 5,
      requiredMeasurements: [],
      recommendedOptions: { cuff: "soft" },
      yardageFormula: { base_metres: 3, coefficients: {}, wastage_margin: 0.1 },
    });

    expect(calls.update).toEqual({
      name: "Classic kurta v2",
      description: "Updated",
      lead_days: 5,
      required_measurements: [],
      recommended_options: { cuff: "soft" },
      yardage_formula: { base_metres: 3, coefficients: {}, wastage_margin: 0.1 },
    });
  });

  it("throws when the update errors", async () => {
    const { client } = recordingClient({ message: "not found" });

    await expect(updateTemplate(client, "t1", { name: "X" })).rejects.toMatchObject({ message: "not found" });
  });
});
