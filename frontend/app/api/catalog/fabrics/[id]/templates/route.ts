import { NextResponse } from "next/server";
import { listCompatibleTemplatesForFabricAction } from "@/app/(storefront)/catalog-actions";

// FR-CUS-06: the template library filtered to what this fabric can make.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await listCompatibleTemplatesForFabricAction({ fabricId: id });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
