import { NextResponse, type NextRequest } from "next/server";
import { priceDraftAction } from "@/app/(order)/order-actions";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await priceDraftAction({ draftId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
