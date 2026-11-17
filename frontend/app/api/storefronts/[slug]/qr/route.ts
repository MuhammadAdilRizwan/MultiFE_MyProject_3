import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { activeAdmin } from "@/lib/active-admin";
import { SLUG_PATTERN, storefrontUrl } from "@/lib/storefront";

// SDS §API: GET /api/storefronts/[slug]/qr — the storefront's QR code
// (FR-ADM-04, FR-CUS-01), admin only. ?format=png (default) or svg;
// ?download=1 saves it as a file. The printable poster
// (/admin/stores/[id]/poster) is the PDF route: print it to PDF.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const admin = await activeAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const { data: store, error } = await admin.supabase.from("suppliers").select("slug").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Failed." }, { status: 500 });
  if (!store) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const url = storefrontUrl(slug);
  if (!url) return NextResponse.json({ ok: false, error: "Set NEXT_PUBLIC_SITE_URL first." }, { status: 503 });

  const format = request.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const download = request.nextUrl.searchParams.get("download") === "1";
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (download) headers["Content-Disposition"] = `attachment; filename="multife-${slug}-qr.${format}"`;

  // High error correction, so a slightly scuffed print still scans.
  if (format === "svg") {
    const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 2 });
    return new NextResponse(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  const png = await QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "H", margin: 2, width: 1024 });
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
}
