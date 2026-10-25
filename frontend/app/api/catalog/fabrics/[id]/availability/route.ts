import { NextResponse, type NextRequest } from "next/server";
import { setFabricAvailabilityAction } from "@/app/(admin)/catalog-actions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await setFabricAvailabilityAction({ fabricId: id, isAvailable: body.isAvailable });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
