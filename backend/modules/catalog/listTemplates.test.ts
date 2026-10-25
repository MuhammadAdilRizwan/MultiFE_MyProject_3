import { describe, expect, it } from "vitest";
import { listTemplates } from "./listTemplates";
import type { AnySupabaseClient } from "./types";

function clientWith(rows: unknown[] | null, error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => Promise.resolve({ data: rows, error }),
  };
  const client = { from: () => builder };
  return client as unknown as AnySupabaseClient;
}

describe("listTemplates", () => {
  it("returns the templates RLS lets the caller see", async () => {
    const client = clientWith([
      { id: "t1", name: "Classic kurta" },
      { id: "t2", name: "A-line dress" },
    ]);

    const result = await listTemplates(client);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Classic kurta");
  });

  it("throws when the query errors", async () => {
    const client = clientWith(null, { message: "connection lost" });

    await expect(listTemplates(client)).rejects.toMatchObject({ message: "connection lost" });
  });
});
