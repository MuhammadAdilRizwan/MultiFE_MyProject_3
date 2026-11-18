import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/production/measurementCorrections", () => ({ respondMeasurementCorrection: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { respondMeasurementCorrection } from "@multife/backend/modules/production/measurementCorrections";
import { respondToCorrectionAction } from "./correction-actions";

const supabase = {};
const ID = "11111111-1111-4111-8111-111111111111";
const as = (role: string) => vi.mocked(getCurrentProfile).mockResolvedValue({ id: "u1", role, status: "active" } as never);

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  vi.mocked(respondMeasurementCorrection).mockReset();
});

describe("respondToCorrectionAction", () => {
  it("needs a note to decline", async () => {
    as("customer");
    expect(await respondToCorrectionAction({ correctionId: ID, accept: false })).toEqual({
      ok: false,
      error: "Tell us what's wrong so we can contact you.",
    });
    expect(respondMeasurementCorrection).not.toHaveBeenCalled();
  });

  it("refuses production staff", async () => {
    as("tailor");
    expect((await respondToCorrectionAction({ correctionId: ID, accept: true })).ok).toBe(false);
  });

  it("accepts for the customer or their agent", async () => {
    vi.mocked(respondMeasurementCorrection).mockResolvedValue({ status: "accepted" } as never);
    for (const role of ["customer", "agent"]) {
      as(role);
      expect(await respondToCorrectionAction({ correctionId: ID, accept: true })).toEqual({ ok: true, data: { status: "accepted" } });
    }
    expect(respondMeasurementCorrection).toHaveBeenCalledWith(supabase, { correctionId: ID, accept: true, note: undefined });
  });

  it("shows only safe database messages", async () => {
    as("customer");
    vi.mocked(respondMeasurementCorrection).mockRejectedValue(Object.assign(new Error("This correction has already been answered"), { code: "P0001" }));
    expect(await respondToCorrectionAction({ correctionId: ID, accept: true })).toEqual({ ok: false, error: "This correction has already been answered" });
    vi.mocked(respondMeasurementCorrection).mockRejectedValue(new Error("relation does not exist"));
    expect(await respondToCorrectionAction({ correctionId: ID, accept: true })).toEqual({ ok: false, error: "We couldn't save your answer. Please try again." });
  });
});
