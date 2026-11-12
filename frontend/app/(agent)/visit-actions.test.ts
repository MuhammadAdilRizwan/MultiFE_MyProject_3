import { beforeEach, describe, expect, it, vi } from "vitest";

// The visit Server Actions' own logic: input validation, the active-agent
// check, the assignment check, and which measurements are required. The
// agents/visits module is mocked; the measurement rules run for real.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@multife/backend/modules/users/getActor", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@multife/backend/modules/agents/getCurrentAgent", () => ({ getCurrentAgent: vi.fn() }));
vi.mock("@multife/backend/modules/agents/getMyCustomer", () => ({ getMyCustomer: vi.fn() }));
vi.mock("@multife/backend/modules/agents/visits", () => ({
  bookVisit: vi.fn(),
  cancelVisit: vi.fn(),
  listMyVisits: vi.fn(),
  recordVisitMeasurements: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@multife/backend/modules/users/getActor";
import { getCurrentAgent } from "@multife/backend/modules/agents/getCurrentAgent";
import { getMyCustomer } from "@multife/backend/modules/agents/getMyCustomer";
import { bookVisit, cancelVisit, listMyVisits, recordVisitMeasurements } from "@multife/backend/modules/agents/visits";
import { bookVisitAction, cancelVisitAction, listMyVisitsAction, recordVisitMeasurementsAction } from "./agent-actions";

const session = { kind: "session" };
const customerId = "623e4567-e89b-12d3-a456-426614174000";
const visitId = "723e4567-e89b-12d3-a456-426614174000";
const tomorrow = () => new Date(Date.now() + 864e5).toISOString();
const core = { height: 160, shoulder_width: 38, chest: 95, waist: 78, hip: 100, sleeve: 55 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(session as never);
  vi.mocked(getCurrentProfile).mockResolvedValue({ id: "agent-p1", role: "agent", status: "active" } as never);
  vi.mocked(getCurrentAgent).mockResolvedValue({ id: "agent-1", status: "active" } as never);
  vi.mocked(getMyCustomer).mockResolvedValue({ customerId, fullName: "Sana", phone: null });
});

describe("who may manage visits", () => {
  it("refuses a non-agent", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "c1", role: "customer", status: "active" } as never);
    expect(await listMyVisitsAction()).toEqual({ ok: false, error: "Sign in as an active agent to manage visits." });
  });

  it("refuses a suspended agent", async () => {
    vi.mocked(getCurrentAgent).mockResolvedValue({ id: "agent-1", status: "suspended" } as never);
    expect((await cancelVisitAction({ visitId })).ok).toBe(false);
    expect(cancelVisit).not.toHaveBeenCalled();
  });

  it("lists the agent's own visits by their profile id", async () => {
    vi.mocked(listMyVisits).mockResolvedValue([]);
    expect(await listMyVisitsAction()).toEqual({ ok: true, data: [] });
    expect(listMyVisits).toHaveBeenCalledWith(session, "agent-p1");
  });
});

describe("bookVisitAction", () => {
  const input = () => ({ customerId, scheduledFor: tomorrow(), address: "House 12, Street 4, Lahore", notes: "" });

  it("validates the address and time", async () => {
    expect(await bookVisitAction({ ...input(), address: "x" })).toEqual({ ok: false, error: "Enter the visit address." });
    expect((await bookVisitAction({ ...input(), scheduledFor: "tomorrow" })).ok).toBe(false);
    expect(await bookVisitAction({ ...input(), scheduledFor: new Date(Date.now() - 864e5).toISOString() })).toEqual({
      ok: false,
      error: "Choose a date and time in the future",
    });
    expect(bookVisit).not.toHaveBeenCalled();
  });

  it("refuses a customer who isn't assigned to the agent", async () => {
    vi.mocked(getMyCustomer).mockResolvedValue(null);
    expect(await bookVisitAction(input())).toEqual({ ok: false, error: "This customer isn't assigned to you." });
  });

  it("books the visit, dropping empty notes", async () => {
    vi.mocked(bookVisit).mockResolvedValue({ id: visitId } as never);
    const data = input();
    expect(await bookVisitAction(data)).toEqual({ ok: true, data: { id: visitId } });
    expect(bookVisit).toHaveBeenCalledWith(session, {
      customerId,
      scheduledFor: data.scheduledFor,
      address: "House 12, Street 4, Lahore",
      notes: undefined,
    });
  });
});

describe("recordVisitMeasurementsAction", () => {
  it("requires the core measurements", async () => {
    const result = await recordVisitMeasurementsAction({ visitId, values: { ...core, chest: "" } });
    expect(result).toEqual({ ok: false, error: "Enter your chest." });
    expect(recordVisitMeasurements).not.toHaveBeenCalled();
  });

  it("checks optional measurements that were filled in, and leaves out empty ones", async () => {
    expect(await recordVisitMeasurementsAction({ visitId, values: { ...core, thigh: 500 } })).toEqual({
      ok: false,
      error: "Thigh must be between 45 and 75 cm.",
    });

    vi.mocked(recordVisitMeasurements).mockResolvedValue({ id: visitId, status: "completed" } as never);
    await recordVisitMeasurementsAction({ visitId, values: { ...core, thigh: "60", ankle: "" } });
    expect(recordVisitMeasurements).toHaveBeenCalledWith(session, { visitId, values: { ...core, thigh: 60 } });
  });

  it("passes the database's 'already closed' message through", async () => {
    vi.mocked(recordVisitMeasurements).mockRejectedValue(new Error("This visit is already closed"));
    expect(await recordVisitMeasurementsAction({ visitId, values: core })).toEqual({ ok: false, error: "This visit is already closed" });
  });

  it("hides other database errors", async () => {
    vi.mocked(recordVisitMeasurements).mockRejectedValue(new Error('relation "x" does not exist'));
    expect(await recordVisitMeasurementsAction({ visitId, values: core })).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });
});
