import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(order)/order-actions", () => ({ createDraftAction: vi.fn(), updateDraftOptionsAction: vi.fn() }));
vi.mock("./order-draft", () => ({ readDraft: vi.fn(), updateDraft: vi.fn() }));

import { createDraftAction, updateDraftOptionsAction } from "@/app/(order)/order-actions";
import { readDraft, updateDraft } from "./order-draft";
import { ensureRemoteDraft, syncRemoteOptions } from "./order-sync";

const base = { brandSlug: "khadi", fabricId: "f1", templateId: "t1", selections: {}, labels: {}, remote: null };

beforeEach(() => {
  vi.mocked(createDraftAction).mockReset();
  vi.mocked(updateDraftOptionsAction).mockReset();
  vi.mocked(updateDraft).mockReset();
});

describe("ensureRemoteDraft", () => {
  it("reuses the database draft for the same fabric and template", async () => {
    vi.mocked(readDraft).mockReturnValue({ ...base, remote: { id: "d1", fabricId: "f1", templateId: "t1" } });

    expect(await ensureRemoteDraft()).toEqual({ ok: true, data: "d1" });
    expect(createDraftAction).not.toHaveBeenCalled();
  });

  it("creates a new draft once the template has changed, and remembers it", async () => {
    vi.mocked(readDraft).mockReturnValue({ ...base, remote: { id: "d1", fabricId: "f1", templateId: "t0" } });
    vi.mocked(createDraftAction).mockResolvedValue({ ok: true, data: { id: "d2" } as never });

    expect(await ensureRemoteDraft()).toEqual({ ok: true, data: "d2" });
    expect(createDraftAction).toHaveBeenCalledWith({ fabricId: "f1", templateId: "t1" });
    expect(updateDraft).toHaveBeenCalledWith({ remote: { id: "d2", fabricId: "f1", templateId: "t1" } });
  });

  it("passes the server's refusal through (e.g. not signed in as a customer)", async () => {
    vi.mocked(readDraft).mockReturnValue(base);
    vi.mocked(createDraftAction).mockResolvedValue({ ok: false, error: "Sign in as a customer to start an order." });

    expect(await ensureRemoteDraft()).toEqual({ ok: false, error: "Sign in as a customer to start an order." });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("needs a fabric and template first", async () => {
    vi.mocked(readDraft).mockReturnValue({ ...base, templateId: null });

    expect((await ensureRemoteDraft()).ok).toBe(false);
    expect(createDraftAction).not.toHaveBeenCalled();
  });
});

describe("syncRemoteOptions", () => {
  it("saves the choices on the account's draft", async () => {
    vi.mocked(readDraft).mockReturnValue({ ...base, remote: { id: "d1", fabricId: "f1", templateId: "t1" } });
    vi.mocked(updateDraftOptionsAction).mockResolvedValue({ ok: true, data: {} as never });

    expect(await syncRemoteOptions({ neckline: "v-neck" })).toEqual({ ok: true, data: "d1" });
    expect(updateDraftOptionsAction).toHaveBeenCalledWith({ draftId: "d1", options: { neckline: "v-neck" } });
  });

  it("returns the server's error when an option is rejected", async () => {
    vi.mocked(readDraft).mockReturnValue({ ...base, remote: { id: "d1", fabricId: "f1", templateId: "t1" } });
    vi.mocked(updateDraftOptionsAction).mockResolvedValue({ ok: false, error: "One or more selected options aren't supported by this fabric." });

    expect(await syncRemoteOptions({ neckline: "halter" })).toEqual({
      ok: false,
      error: "One or more selected options aren't supported by this fabric.",
    });
  });
});
