import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sendQueuedEmails } from "@/lib/notifications";

// Scheduled sender for queued emails (FR-NOT-02/03): picks up retries and
// anything the per-action send missed. Point a scheduler at it (e.g. Vercel
// Cron, or Supabase pg_cron + pg_net) every few minutes with
// "Authorization: Bearer <CRON_SECRET>". Disabled while CRON_SECRET is unset.

export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 });
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  try {
    const result = await sendQueuedEmails(50);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("cron notifications failed:", error instanceof Error ? error.name : "unknown error");
    return NextResponse.json({ ok: false, error: "Failed." }, { status: 500 });
  }
}
