import { describe, expect, it } from "vitest";
import { getMyProfile, updateMyProfile } from "./myProfile";
import type { AnySupabaseClient } from "./types";

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "update", "eq"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  const client = {
    from(table: string) {
      calls.push({ op: "from", args: [table] });
      return builder;
    },
  } as unknown as AnySupabaseClient;
  return { client, calls };
}

const row = {
  full_name: "Sana Khan",
  phone: "+923001234567",
  email: "sana@example.pk",
  delivery_address: { address_line: "House 4, Street 9, F-7", city: "Islamabad" },
};

describe("getMyProfile", () => {
  it("reads the user's own row", async () => {
    const { client, calls } = fakeClient({ data: row, error: null });
    expect(await getMyProfile(client, "u1")).toEqual({
      fullName: "Sana Khan",
      phone: "+923001234567",
      email: "sana@example.pk",
      address: { address_line: "House 4, Street 9, F-7", city: "Islamabad" },
    });
    expect(calls).toContainEqual({ op: "eq", args: ["id", "u1"] });
  });

  it("treats a missing or malformed address as none", async () => {
    const { client } = fakeClient({ data: { ...row, full_name: null, delivery_address: { city: "Lahore" } }, error: null });
    expect(await getMyProfile(client, "u1")).toMatchObject({ fullName: "", address: null });
  });

  it("returns null for no row and throws database errors", async () => {
    expect(await getMyProfile(fakeClient({ data: null, error: null }).client, "u1")).toBeNull();
    await expect(getMyProfile(fakeClient({ data: null, error: { message: "boom" } }).client, "u1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("updateMyProfile", () => {
  it("updates only name, phone and address on the user's own row", async () => {
    const { client, calls } = fakeClient({ data: row, error: null });
    const result = await updateMyProfile(client, {
      userId: "u1",
      fullName: "Sana Khan",
      phone: "+923001234567",
      address: { address_line: "House 4, Street 9, F-7", city: "Islamabad" },
    });
    expect(calls).toContainEqual({
      op: "update",
      args: [{ full_name: "Sana Khan", phone: "+923001234567", delivery_address: { address_line: "House 4, Street 9, F-7", city: "Islamabad" } }],
    });
    expect(calls).toContainEqual({ op: "eq", args: ["id", "u1"] });
    expect(result.fullName).toBe("Sana Khan");
  });

  it("throws when the update is refused", async () => {
    const { client } = fakeClient({ data: null, error: { message: "Only an admin can change profiles.role" } });
    await expect(updateMyProfile(client, { userId: "u1", fullName: "A B", phone: null, address: null })).rejects.toMatchObject({
      message: "Only an admin can change profiles.role",
    });
  });
});
