import { NextResponse } from "next/server";
import { listJobQueueAction } from "@/app/(production)/production-actions";

export async function GET() {
  const result = await listJobQueueAction();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
