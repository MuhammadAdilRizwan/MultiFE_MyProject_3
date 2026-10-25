import { NextResponse, type NextRequest } from "next/server";
import { getTemplateOptionsForFabricAction } from "@/app/(storefront)/catalog-actions";

// SDS §5.2 customization step: options this template offers that the given
// fabric also supports.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fabricId = request.nextUrl.searchParams.get("fabricId");
  if (!fabricId) return NextResponse.json({ ok: false, error: "fabricId is required." }, { status: 400 });

  const result = await getTemplateOptionsForFabricAction({ templateId: id, fabricId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
