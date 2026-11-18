// Strips personal data from what we send to Sentry: customer emails, phones,
// addresses and body measurements must never leave the app (NFR-PRIV).
// Pure and framework-free so it can be unit-tested without the SDK.

const REDACTED = "[redacted]";

// Whole words in a key that mark it as personal (split on _, - and camelCase),
// so "hip" catches `hip` and `hip_cm` but not `shipment`.
const SENSITIVE_WORDS = new Set([
  "chest", "bust", "waist", "hip", "hips", "shoulder", "sleeve", "inseam", "thigh", "ankle", "armhole", "neck", "height",
]);
// Fragments that mark a key as personal wherever they appear.
const SENSITIVE_FRAGMENTS = ["email", "phone", "password", "passwd", "token", "secret", "address", "measure", "cookie", "authorization", "fullname", "firstname", "lastname"];

function isSensitiveKey(key: string): boolean {
  const flat = key.toLowerCase().replace(/[^a-z]/g, "");
  if (SENSITIVE_FRAGMENTS.some((f) => flat.includes(f))) return true;
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/);
  return words.some((w) => SENSITIVE_WORDS.has(w));
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// +country-code numbers, 10+ digit runs, and local 03xx xxxxxxx style numbers —
// not short digit groups, so order numbers (MF-2026-000123) survive.
const PHONE = /\+\d[\d\s-]{7,}\d|\b\d{10,}\b|\b0\d{3}[\s-]?\d{7}\b/g;

const maskText = (text: string) => text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return maskText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, isSensitiveKey(k) ? REDACTED : scrubValue(v)]),
    );
  }
  return value;
}

const SENSITIVE_HEADERS = new Set(["cookie", "authorization", "x-forwarded-for", "x-real-ip", "set-cookie"]);

type Breadcrumb = { message?: string; data?: unknown; [key: string]: unknown };

export function scrubBreadcrumb<T extends Breadcrumb>(breadcrumb: T): T {
  const out: Breadcrumb = { ...breadcrumb };
  delete out.data;
  if (typeof out.message === "string") out.message = maskText(out.message);
  return out as T;
}

type ScrubbableEvent = {
  message?: string;
  user?: unknown;
  request?: { url?: string; data?: unknown; cookies?: unknown; query_string?: unknown; headers?: Record<string, string>; [key: string]: unknown };
  exception?: { values?: { value?: string; [key: string]: unknown }[] };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: Breadcrumb[];
  [key: string]: unknown;
};

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const out: ScrubbableEvent = { ...event };

  delete out.user;
  if (typeof out.message === "string") out.message = maskText(out.message);

  if (out.request) {
    const request = { ...out.request };
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (typeof request.url === "string") request.url = request.url.split("?")[0];
    if (request.headers) {
      request.headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase())));
    }
    out.request = request;
  }

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => (typeof v.value === "string" ? { ...v, value: maskText(v.value) } : v)),
    };
  }

  if (out.extra) out.extra = scrubValue(out.extra) as Record<string, unknown>;
  if (out.contexts) out.contexts = scrubValue(out.contexts) as Record<string, unknown>;
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb);

  return out as T;
}
