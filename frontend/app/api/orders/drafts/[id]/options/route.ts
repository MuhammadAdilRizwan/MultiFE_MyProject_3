import { NextResponse, type NextRequest } from "next/server";
import { updateDraftOptionsAction } from "@/app/(order)/order-actions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await updateDraftOptionsAction({ draftId: id, options: body.options });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
