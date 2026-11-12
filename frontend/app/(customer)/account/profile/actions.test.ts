import { beforeEach, describe, expect, it, vi } from "vitest";

// The account details actions: who may use them, validation, phone
// normalisation and the address rules. The profile module is mocked.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/users/myProfile", () => ({ getMyProfile: vi.fn(), updateMyProfile: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getMyProfile, updateMyProfile } from "@multife/backend/modules/users/myProfile";
import { getMyProfileAction, updateMyProfileAction } from "./actions";

const session = { kind: "session" };
const saved = { fullName: "Sana Khan", phone: "+923001234567", email: "sana@x.test", address: null };
const input = { fullName: "Sana Khan", phone: "0300 1234567", addressLine: "House 4, Street 9, F-7", city: "Islamabad" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
  vi.mocked(getMyProfile).mockResolvedValue(saved);
  vi.mocked(updateMyProfile).mockResolvedValue(saved);
});

describe("getMyProfileAction", () => {
  it("returns the signed-in customer's own details", async () => {
    expect(await getMyProfileAction()).toEqual({ ok: true, data: saved });
    expect(getMyProfile).toHaveBeenCalledWith(session, "c1");
  });

  it("refuses staff", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "a1", role: "admin", status: "active" } as never);
    expect((await getMyProfileAction()).ok).toBe(false);
    expect(getMyProfile).not.toHaveBeenCalled();
  });
});

describe("updateMyProfileAction", () => {
  it("saves name, the phone in international form, and the address", async () => {
    expect((await updateMyProfileAction(input)).ok).toBe(true);
    expect(updateMyProfile).toHaveBeenCalledWith(session, {
      userId: "c1",
      fullName: "Sana Khan",
      phone: "+923001234567",
      address: { address_line: "House 4, Street 9, F-7", city: "Islamabad" },
    });
  });

  it("clears the phone and address when left empty", async () => {
    await updateMyProfileAction({ fullName: "Sana Khan", phone: " ", addressLine: "", city: "" });
    expect(updateMyProfile).toHaveBeenCalledWith(session, { userId: "c1", fullName: "Sana Khan", phone: null, address: null });
  });

  it("points at the field that's wrong", async () => {
    expect(await updateMyProfileAction({ ...input, fullName: "S" })).toMatchObject({ ok: false, field: "fullName" });
    expect(await updateMyProfileAction({ ...input, phone: "12ab" })).toMatchObject({ ok: false, field: "phone" });
    expect(await updateMyProfileAction({ ...input, city: "" })).toMatchObject({ ok: false, field: "city" });
    expect(await updateMyProfileAction({ ...input, addressLine: "" })).toMatchObject({ ok: false, field: "addressLine" });
    expect(await updateMyProfileAction({ ...input, addressLine: "F-7" })).toMatchObject({ ok: false, field: "addressLine" });
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("refuses a suspended customer", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "suspended" } as never);
    expect((await updateMyProfileAction(input)).ok).toBe(false);
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("hides database errors", async () => {
    vi.mocked(updateMyProfile).mockRejectedValue({ message: "Only an admin can change profiles.role" });
    expect(await updateMyProfileAction(input)).toEqual({ ok: false, error: "We couldn't save your details. Please try again." });
  });
});
