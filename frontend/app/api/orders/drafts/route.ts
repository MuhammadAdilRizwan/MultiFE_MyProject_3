import { NextResponse, type NextRequest } from "next/server";
import { createDraftAction } from "@/app/(order)/order-actions";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await createDraftAction({ fabricId: body.fabricId, templateId: body.templateId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
