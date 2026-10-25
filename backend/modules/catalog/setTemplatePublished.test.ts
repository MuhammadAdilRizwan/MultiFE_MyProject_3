import { describe, expect, it } from "vitest";
import { setTemplatePublished } from "./setTemplatePublished";
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

describe("setTemplatePublished", () => {
  it("publishes a template", async () => {
    const { client, calls } = recordingClient();

    await setTemplatePublished(client, "t1", true);

    expect(calls.update).toEqual({ is_published: true });
    expect(calls.eq).toEqual(["id", "t1"]);
  });

  it("unpublishes a template", async () => {
    const { client, calls } = recordingClient();

    await setTemplatePublished(client, "t1", false);

    expect(calls.update).toEqual({ is_published: false });
  });

  it("throws when the update errors", async () => {
    const { client } = recordingClient({ message: "not found" });

    await expect(setTemplatePublished(client, "t1", true)).rejects.toMatchObject({ message: "not found" });
  });
});
