import { describe, expect, it, vi } from "vitest";
import { getCorrectionThreshold, requestMeasurementCorrection, respondMeasurementCorrection } from "./measurementCorrections";
import type { AnySupabaseClient } from "./types";

const client = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { supabase: { rpc } as unknown as AnySupabaseClient, rpc };
};

describe("measurement corrections", () => {
  it("sends a correction to the customer", async () => {
    const { supabase, rpc } = client({ id: "c1", status: "pending" });
    await requestMeasurementCorrection(supabase, { jobId: "j1", values: { chest: 95 }, reason: "Re-measured" });
    expect(rpc).toHaveBeenCalledWith("fn_request_measurement_correction", { p_job_id: "j1", p_values: { chest: 95 }, p_reason: "Re-measured" });
  });

  it("records the customer's answer", async () => {
    const { supabase, rpc } = client({ id: "c1", status: "declined" });
    await respondMeasurementCorrection(supabase, { correctionId: "c1", accept: false, note: "Chest is right" });
    expect(rpc).toHaveBeenCalledWith("fn_respond_measurement_correction", { p_correction_id: "c1", p_accept: false, p_note: "Chest is right" });
    await respondMeasurementCorrection(supabase, { correctionId: "c1", accept: true });
    expect(rpc).toHaveBeenLastCalledWith("fn_respond_measurement_correction", { p_correction_id: "c1", p_accept: true, p_note: null });
  });

  it("reads the threshold as a number", async () => {
    const { supabase } = client("2.0");
    expect(await getCorrectionThreshold(supabase)).toBe(2);
  });

  it("passes database errors through", async () => {
    const { supabase } = client(null, new Error("This correction has already been answered"));
    await expect(respondMeasurementCorrection(supabase, { correctionId: "c1", accept: true })).rejects.toThrow("already been answered");
  });
});
