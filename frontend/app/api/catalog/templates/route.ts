import { NextResponse, type NextRequest } from "next/server";
import { createTemplateAction } from "@/app/(admin)/catalog-actions";
import { listTemplatesAction } from "@/app/(storefront)/catalog-actions";

export async function GET() {
  const result = await listTemplatesAction();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await createTemplateAction(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
