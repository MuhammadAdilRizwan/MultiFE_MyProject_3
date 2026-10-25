import { NextResponse, type NextRequest } from "next/server";
import { updateTemplateAction } from "@/app/(admin)/catalog-actions";
import { getTemplateAction } from "@/app/(storefront)/catalog-actions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getTemplateAction({ templateId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await updateTemplateAction({ ...body, templateId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
