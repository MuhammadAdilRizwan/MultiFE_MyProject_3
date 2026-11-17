import { NextResponse } from "next/server";
import { listReadyToShipAction } from "@/app/(production)/fulfilment-actions";

export async function GET() {
  const result = await listReadyToShipAction();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
