import { describe, expect, it } from "vitest";
import { updateDraftOptions } from "./updateDraftOptions";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let updatedWith: unknown;
  let filteredId: unknown;
  const builder: Record<string, unknown> = {
    update: (v: unknown) => {
      updatedWith = v;
      return builder;
    },
    eq: (_col: string, v: unknown) => {
      filteredId = v;
      return builder;
    },
    select: () => builder,
    single: () => Promise.resolve(value),
  };
  const client = { from: () => builder } as unknown as AnySupabaseClient;
  return { client, getUpdatedWith: () => updatedWith, getFilteredId: () => filteredId };
}

describe("updateDraftOptions", () => {
  it("updates the draft's options and moves its step to 'customize'", async () => {
    const { client, getUpdatedWith, getFilteredId } = recordingClient({ data: { id: "d1" } });

    await updateDraftOptions(client, "d1", { sleeve: "full" });

    expect(getFilteredId()).toBe("d1");
    expect(getUpdatedWith()).toEqual({ options: { sleeve: "full" }, step: "customize" });
  });

  it("returns the updated row", async () => {
    const { client } = recordingClient({ data: { id: "d1", options: { sleeve: "full" }, step: "customize" } });

    const draft = await updateDraftOptions(client, "d1", { sleeve: "full" });

    expect(draft).toEqual({ id: "d1", options: { sleeve: "full" }, step: "customize" });
  });

  it("throws when the update errors", async () => {
    const { client } = recordingClient({ error: { message: "draft not found" } });

    await expect(updateDraftOptions(client, "missing", {})).rejects.toMatchObject({
      message: "draft not found",
    });
  });
});
