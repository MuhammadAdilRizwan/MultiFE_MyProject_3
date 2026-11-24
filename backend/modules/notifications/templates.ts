// Customer emails for order events (FR-NOT-01, FR-NOT-05). The payload is what
// fn_notify_order queues: order number, status, total, delivery date,
// customer name and an optional reason. No measurements, no addresses.

export interface NotificationPayload {
  order_number?: string;
  status?: string;
  total?: number | string;
  est_delivery_date?: string | null;
  customer_name?: string | null;
  reason?: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Copy = { subject: (n: string) => string; lines: (p: NotificationPayload) => string[] };

const pkr = (v: number | string | undefined) =>
  v === undefined || v === null || Number.isNaN(Number(v))
    ? null
    : `PKR ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const date = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })
    : null;

const COPY: Record<string, Copy> = {
  order_placed: {
    subject: (n) => `Your MultiFe order ${n} is confirmed`,
    lines: (p) => [
      "Thank you — we've received your order and our workshop will start on it once the fabric arrives.",
      ...(date(p.est_delivery_date) ? [`Estimated delivery: ${date(p.est_delivery_date)}.`] : []),
      ...(pkr(p.total) ? [`Total: ${pkr(p.total)}.`] : []),
    ],
  },
  order_cancelled: {
    subject: (n) => `Your MultiFe order ${n} has been cancelled`,
    lines: (p) => [
      "Your order has been cancelled.",
      ...(p.reason ? [`Reason: ${p.reason}`] : []),
      "If you paid online, your refund is on its way.",
    ],
  },
  measurement_correction: {
    subject: (n) => `Please check your measurements for order ${n}`,
    lines: (p) => [
      "Our tailor checked your measurements and suggests some changes before cutting your fabric.",
      ...(p.reason ? [`Tailor's note: ${p.reason}`] : []),
      "Your order is paused until you accept or decline the changes on your order page.",
    ],
  },
  measurement_correction_price: {
    subject: (n) => `Please check your measurements and new price for order ${n}`,
    lines: (p) => [
      "Our tailor checked your measurements and suggests some changes before cutting your fabric.",
      ...(p.reason ? [`Tailor's note: ${p.reason}`] : []),
      "These changes also change how much fabric your outfit needs, so the price may change. Your order page shows the new price.",
      "Your order is paused until you accept or decline the changes on your order page.",
    ],
  },
  order_dispatched: {
    subject: (n) => `Your MultiFe order ${n} is on its way`,
    lines: () => ["Your outfit has been handed to the courier. The courier and tracking number are on your order page."],
  },
  delivery_failed: {
    subject: (n) => `We couldn't deliver your MultiFe order ${n}`,
    lines: (p) => [
      "The courier couldn't deliver your outfit this time.",
      ...(p.reason ? [`Courier's note: ${p.reason}`] : []),
      "We'll send it again shortly. Reply to this email if your address or phone number has changed.",
    ],
  },
  ready_for_collection: {
    subject: (n) => `Your MultiFe order ${n} is ready to collect`,
    lines: () => ["Your outfit is ready. Collect it from our workshop — the address is on your order page."],
  },
  order_delivered: {
    subject: (n) => `Your MultiFe order ${n} has been delivered`,
    lines: () => ["Your outfit has been delivered. We hope you love it!"],
  },
};

const GENERIC: Copy = {
  subject: (n) => `An update on your MultiFe order ${n}`,
  lines: () => ["There's an update on your order. See your order page for details."],
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderEmail(template: string, payload: NotificationPayload, siteUrl: string): RenderedEmail {
  const copy = COPY[template] ?? GENERIC;
  const number = payload.order_number ?? "";
  const greeting = payload.customer_name?.trim() ? `Hi ${payload.customer_name.trim()},` : "Hi,";
  const link = number ? `${siteUrl.replace(/\/$/, "")}/account/orders/${encodeURIComponent(number)}` : siteUrl;
  const lines = copy.lines(payload);

  const text = [greeting, "", ...lines, "", `View your order: ${link}`, "", "— MultiFe"].join("\n");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0b1f33;max-width:560px">`,
    `<p>${escapeHtml(greeting)}</p>`,
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#0a6ea8;color:#ffffff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">View your order</a></p>`,
    `<p style="color:#5b6b7b">— MultiFe</p>`,
    `</div>`,
  ].join("");
  return { subject: copy.subject(number), text, html };
}
