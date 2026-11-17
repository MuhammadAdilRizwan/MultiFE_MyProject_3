import { NextResponse, type NextRequest } from "next/server";
import { dispatchOrderAction } from "@/app/(production)/fulfilment-actions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await dispatchOrderAction({ orderId: id, courier: body.courier, trackingRef: body.trackingRef });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
