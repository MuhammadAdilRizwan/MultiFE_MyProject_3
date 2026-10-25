import { describe, expect, it } from "vitest";
import { getTemplate } from "./getTemplate";
import type { AnySupabaseClient } from "./types";

function clientWith(opts: {
  template?: Record<string, unknown> | null;
  templateError?: { message: string };
  options?: unknown[];
  optionsError?: { message: string };
}) {
  const builders: Record<string, Record<string, unknown>> = {
    dress_templates: {
      select: () => builders.dress_templates,
      eq: () => builders.dress_templates,
      maybeSingle: () =>
        Promise.resolve(
          opts.templateError
            ? { data: null, error: opts.templateError }
            : { data: opts.template ?? null, error: null },
        ),
    },
    template_options: {
      select: () => builders.template_options,
      eq: () =>
        Promise.resolve(
          opts.optionsError ? { data: null, error: opts.optionsError } : { data: opts.options ?? [], error: null },
        ),
    },
  };
  const client = { from: (table: string) => builders[table] };
  return client as unknown as AnySupabaseClient;
}

describe("getTemplate", () => {
  it("returns null when the template doesn't exist (or isn't visible under RLS)", async () => {
    const client = clientWith({ template: null });

    await expect(getTemplate(client, "missing")).resolves.toBeNull();
  });

  it("returns the template with its options, each carrying its group and value labels", async () => {
    const client = clientWith({
      template: { id: "t1", name: "Classic kurta" },
      options: [
        {
          id: "o1",
          group_id: "g1",
          value_id: "v1",
          price_delta: 500,
          extra_lead_days: 0,
          is_default: true,
          option_groups: { key: "cuff", label: "Cuff" },
          option_values: { key: "soft", label: "Soft", image_url: null },
        },
      ],
    });

    const result = await getTemplate(client, "t1");

    expect(result?.name).toBe("Classic kurta");
    expect(result?.options).toHaveLength(1);
    expect(result?.options[0].group).toEqual({ key: "cuff", label: "Cuff" });
    expect(result?.options[0].value).toEqual({ key: "soft", label: "Soft", image_url: null });
    expect(result?.options[0].price_delta).toBe(500);
  });

  it("returns an empty options array when the template has none", async () => {
    const client = clientWith({ template: { id: "t1", name: "Classic kurta" }, options: [] });

    const result = await getTemplate(client, "t1");

    expect(result?.options).toEqual([]);
  });

  it("throws when the template lookup errors", async () => {
    const client = clientWith({ templateError: { message: "connection lost" } });

    await expect(getTemplate(client, "t1")).rejects.toMatchObject({ message: "connection lost" });
  });

  it("throws when the options lookup errors", async () => {
    const client = clientWith({ template: { id: "t1", name: "Classic kurta" }, optionsError: { message: "connection lost" } });

    await expect(getTemplate(client, "t1")).rejects.toMatchObject({ message: "connection lost" });
  });
});
