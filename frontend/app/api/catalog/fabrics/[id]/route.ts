import { NextResponse } from "next/server";
import { getFabricAction } from "@/app/(storefront)/catalog-actions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getFabricAction({ fabricId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
