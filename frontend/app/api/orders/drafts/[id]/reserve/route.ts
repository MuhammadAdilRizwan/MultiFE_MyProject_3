import { NextResponse, type NextRequest } from "next/server";
import { takeSoftReservationAction } from "@/app/(order)/order-actions";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await takeSoftReservationAction({ draftId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
