import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";

describe("renderEmail", () => {
  it("renders an order confirmation with date, total and link", () => {
    const email = renderEmail(
      "order_placed",
      { order_number: "MF-2026-000007", total: "12500.00", est_delivery_date: "2026-12-01", customer_name: "Ayesha" },
      "https://multife.pk/",
    );
    expect(email.subject).toBe("Your MultiFe order MF-2026-000007 is confirmed");
    expect(email.text).toContain("Hi Ayesha,");
    expect(email.text).toContain("PKR 12,500");
    expect(email.text).toContain("https://multife.pk/account/orders/MF-2026-000007");
    expect(email.html).toContain('href="https://multife.pk/account/orders/MF-2026-000007"');
  });

  it("escapes anything user-written in the HTML", () => {
    const email = renderEmail(
      "measurement_correction",
      { order_number: "MF-2026-000007", reason: "<script>x</script>", customer_name: "A & B" },
      "https://multife.pk",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("A &amp; B");
  });

  it("falls back to a generic update for an unknown template", () => {
    expect(renderEmail("something_new", { order_number: "MF-1" }, "https://multife.pk").subject).toBe(
      "An update on your MultiFe order MF-1",
    );
  });
});
