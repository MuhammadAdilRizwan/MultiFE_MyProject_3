import { NextResponse, type NextRequest } from "next/server";
import { requestPasswordResetAction } from "@/app/(auth)/actions";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await requestPasswordResetAction(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
