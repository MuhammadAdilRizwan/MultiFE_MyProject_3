import { NextResponse, type NextRequest } from "next/server";
import { createProvisionalCustomerAction, listMyCustomersAction } from "@/app/(agent)/agent-actions";

export async function GET() {
  const result = await listMyCustomersAction();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await createProvisionalCustomerAction({ phone: body.phone, fullName: body.fullName });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
