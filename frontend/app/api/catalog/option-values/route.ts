import { NextResponse, type NextRequest } from "next/server";
import { createOptionValueAction } from "@/app/(admin)/catalog-actions";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await createOptionValueAction(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
