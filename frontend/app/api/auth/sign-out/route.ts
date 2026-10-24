import { NextResponse } from "next/server";
import { signOutAction } from "@/app/(auth)/actions";

export async function POST() {
  const result = await signOutAction();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
