import { beforeEach, describe, expect, it, vi } from "vitest";

// The account measurement actions' own logic: who may use them, input
// validation, and the shape returned. Modules are mocked at the boundary;
// the measurement rules run for real.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/measurements/getMeasurementProfile", () => ({ getLatestConfirmedProfile: vi.fn() }));
vi.mock("@multife/backend/modules/measurements/saveMyMeasurements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@multife/backend/modules/measurements/saveMyMeasurements")>()),
  saveMyMeasurements: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getLatestConfirmedProfile } from "@multife/backend/modules/measurements/getMeasurementProfile";
import { saveMyMeasurements } from "@multife/backend/modules/measurements/saveMyMeasurements";
import { getMyMeasurementsAction, saveMyMeasurementsAction } from "./actions";

const session = { kind: "session" };
const core = { height: 160, shoulder_width: 38, chest: 90, waist: 74, hip: 98, sleeve: 55 };
const row = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  customer_id: "c1",
  label: "Me",
  measurement_values: core,
  source: "manual",
  confirmed_by_role: "customer",
  confirmed_at: "2026-11-12T10:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
  vi.mocked(getLatestConfirmedProfile).mockResolvedValue(row() as never);
  vi.mocked(saveMyMeasurements).mockResolvedValue(row() as never);
});

describe("getMyMeasurementsAction", () => {
  it("returns the latest confirmed set and who took it", async () => {
    vi.mocked(getLatestConfirmedProfile).mockResolvedValue(row({ confirmed_by_role: "agent" }) as never);
    expect(await getMyMeasurementsAction()).toEqual({
      ok: true,
      data: { values: core, confirmedAt: "2026-11-12T10:00:00Z", confirmedBy: "agent" },
    });
    expect(getLatestConfirmedProfile).toHaveBeenCalledWith(session, "c1");
  });

  it("returns null when nothing is saved yet", async () => {
    vi.mocked(getLatestConfirmedProfile).mockResolvedValue(null);
    expect(await getMyMeasurementsAction()).toEqual({ ok: true, data: null });
  });

  it("refuses staff and signed-out visitors", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "a1", role: "agent", status: "active" } as never);
    expect((await getMyMeasurementsAction()).ok).toBe(false);
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    expect((await getMyMeasurementsAction()).ok).toBe(false);
    expect(getLatestConfirmedProfile).not.toHaveBeenCalled();
  });

  it("hides database errors", async () => {
    vi.mocked(getLatestConfirmedProfile).mockRejectedValue(new Error("relation does not exist"));
    const result = await getMyMeasurementsAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toMatch(/relation/);
  });
});

describe("saveMyMeasurementsAction", () => {
  it("saves the validated set for the signed-in customer only", async () => {
    const result = await saveMyMeasurementsAction({ values: { ...core, neck: "36", thigh: "", shoe: "40" }, confirmed: true });
    expect(result.ok).toBe(true);
    expect(saveMyMeasurements).toHaveBeenCalledWith(session, { customerId: "c1", values: { ...core, neck: 36 } });
  });

  it("requires the confirmation tick", async () => {
    expect((await saveMyMeasurementsAction({ values: core, confirmed: false as never })).ok).toBe(false);
    expect(saveMyMeasurements).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range or missing core value", async () => {
    expect(await saveMyMeasurementsAction({ values: { ...core, chest: 300 }, confirmed: true })).toEqual({
      ok: false,
      error: "Chest must be between 75 and 135 cm.",
    });
    expect((await saveMyMeasurementsAction({ values: { ...core, hip: "" }, confirmed: true })).ok).toBe(false);
    expect(saveMyMeasurements).not.toHaveBeenCalled();
  });

  it("refuses a suspended customer", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "suspended" } as never);
    expect((await saveMyMeasurementsAction({ values: core, confirmed: true })).ok).toBe(false);
    expect(saveMyMeasurements).not.toHaveBeenCalled();
  });

  it("returns a generic message when the save fails", async () => {
    vi.mocked(saveMyMeasurements).mockRejectedValue(new Error("Not allowed"));
    expect(await saveMyMeasurementsAction({ values: core, confirmed: true })).toEqual({
      ok: false,
      error: "We couldn't save your measurements. Please try again.",
    });
  });
});
