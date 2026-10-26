import { describe, expect, it } from "vitest";
import { takeSoftReservation } from "./takeSoftReservation";
import type { AnySupabaseClient } from "./types";

function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const value = { data: result.data ?? null, error: result.error ?? null };
  let calledWith: { fn: string; args: unknown } | undefined;
  const client = {
    rpc: (fn: string, args: unknown) => {
      calledWith = { fn, args };
      return Promise.resolve(value);
    },
  } as unknown as AnySupabaseClient;
  return { client, getCalledWith: () => calledWith };
}

describe("takeSoftReservation", () => {
  it("calls fn_take_soft_reservation with the draft, fabric and metres", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "r1" } });

    await takeSoftReservation(client, { draftId: "d1", fabricId: "f1", metres: 4.5 });

    expect(getCalledWith()).toEqual({
      fn: "fn_take_soft_reservation",
      args: { p_draft_id: "d1", p_fabric_id: "f1", p_metres: 4.5 },
    });
  });

  it("passes a custom expiry through as p_expires_in", async () => {
    const { client, getCalledWith } = recordingClient({ data: { id: "r1" } });

    await takeSoftReservation(client, { draftId: "d1", fabricId: "f1", metres: 4.5, expiresIn: "5 minutes" });

    expect(getCalledWith()).toMatchObject({ args: { p_expires_in: "5 minutes" } });
  });

  it("returns the reservation row", async () => {
    const { client } = recordingClient({ data: { id: "r1", kind: "soft", status: "active" } });

    const reservation = await takeSoftReservation(client, { draftId: "d1", fabricId: "f1", metres: 4.5 });

    expect(reservation).toEqual({ id: "r1", kind: "soft", status: "active" });
  });

  it("throws the DB's own error (e.g. not enough stock)", async () => {
    const { client } = recordingClient({ error: { message: "Not enough fabric in stock" } });

    await expect(
      takeSoftReservation(client, { draftId: "d1", fabricId: "f1", metres: 999 }),
    ).rejects.toMatchObject({ message: "Not enough fabric in stock" });
  });
});
