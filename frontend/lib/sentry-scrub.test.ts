import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

describe("scrubEvent", () => {
  it("drops request bodies, cookies, auth headers and query strings", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.test/sign-in?next=/account&email=a@x.com",
        data: { email: "a@x.com", password: "hunter2" },
        cookies: { "sb-access-token": "abc" },
        query_string: "email=a@x.com",
        headers: { cookie: "sb=1", authorization: "Bearer x", "user-agent": "Mozilla", "x-forwarded-for": "203.0.113.7" },
      },
    });

    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.headers).toEqual({ "user-agent": "Mozilla" });
    expect(event.request?.url).toBe("https://app.test/sign-in");
  });

  it("removes the user entirely (id, email, IP, username)", () => {
    const event = scrubEvent({ user: { id: "u1", email: "a@x.com", ip_address: "203.0.113.7", username: "amy" } });
    expect(event.user).toBeUndefined();
  });

  it("redacts sensitive keys wherever they sit in extra data and contexts", () => {
    const event = scrubEvent({
      extra: { email: "a@x.com", nested: { phone: "03001234567", address_line: "12 Main Blvd", ok: "keep me" } },
      contexts: { order: { chest: 96, waist: 80, full_name: "Amy Khan", order_number: "MF-2026-000123" } },
    });

    expect(event.extra).toEqual({ email: "[redacted]", nested: { phone: "[redacted]", address_line: "[redacted]", ok: "keep me" } });
    expect(event.contexts).toEqual({ order: { chest: "[redacted]", waist: "[redacted]", full_name: "[redacted]", order_number: "MF-2026-000123" } });
  });

  it("masks emails and phone numbers inside messages and exception text", () => {
    const event = scrubEvent({
      message: "Could not email a@x.com or call +92 300 1234567",
      exception: { values: [{ type: "Error", value: "Key (email)=(amy@example.org) already exists" }] },
    });

    expect(event.message).toBe("Could not email [email] or call [phone]");
    expect(event.exception?.values?.[0]?.value).toBe("Key (email)=([email]) already exists");
    expect(event.exception?.values?.[0]?.type).toBe("Error");
  });

  it("masks local-format phone numbers but leaves order numbers alone", () => {
    const event = scrubEvent({ message: "Call 0300 1234567 or 03001234567 about MF-2026-000123" });
    expect(event.message).toBe("Call [phone] or [phone] about MF-2026-000123");
  });

  it("keeps what's needed to debug: stack frames, tags, level", () => {
    const frames = [{ filename: "app/x.ts", lineno: 3 }];
    const event = scrubEvent({
      level: "error",
      tags: { route: "/order/checkout" },
      exception: { values: [{ type: "TypeError", value: "x is undefined", stacktrace: { frames } }] },
    });

    expect(event.level).toBe("error");
    expect(event.tags).toEqual({ route: "/order/checkout" });
    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual(frames);
  });

  it("scrubs breadcrumbs inside the event too", () => {
    const event = scrubEvent({
      breadcrumbs: [{ category: "fetch", message: "POST a@x.com", data: { url: "/api/x?email=a@x.com", body: "..." } }],
    });
    expect(event.breadcrumbs?.[0]).toEqual({ category: "fetch", message: "POST [email]" });
  });
});

describe("scrubBreadcrumb", () => {
  it("drops the data payload (URLs, form values) and masks the message", () => {
    expect(scrubBreadcrumb({ category: "ui.input", message: "typed a@x.com", data: { value: "secret" } })).toEqual({
      category: "ui.input",
      message: "typed [email]",
    });
  });
});
