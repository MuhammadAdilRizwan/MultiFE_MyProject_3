import { describe, expect, it } from "vitest";
import { clearDraft, readDraft, setActingFor, setSelections, startDraft, updateDraft } from "./order-draft";

describe("setActingFor", () => {
  it("attaches the customer and keeps the agent's design", () => {
    clearDraft();
    startDraft("khadi", "f1");
    updateDraft({ templateId: "t1" });
    setSelections({ neckline: "round" }, { neckline: "Neckline: Round" });

    setActingFor({ customerId: "c1", name: "Ayesha" });

    expect(readDraft()).toMatchObject({
      brandSlug: "khadi",
      fabricId: "f1",
      templateId: "t1",
      selections: { neckline: "round" },
      labels: { neckline: "Neckline: Round" },
      actingFor: { customerId: "c1", name: "Ayesha" },
    });
  });

  it("is kept when the agent then switches fabric", () => {
    clearDraft();
    setActingFor({ customerId: "c1", name: "Ayesha" });
    startDraft("khadi", "f2");
    expect(readDraft().actingFor).toEqual({ customerId: "c1", name: "Ayesha" });
  });
});
