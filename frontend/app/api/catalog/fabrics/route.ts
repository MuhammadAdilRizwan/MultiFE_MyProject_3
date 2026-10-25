import { NextResponse, type NextRequest } from "next/server";
import { listFabricsAction } from "@/app/(storefront)/catalog-actions";

export async function GET(request: NextRequest) {
  const supplierId = request.nextUrl.searchParams.get("supplierId") ?? undefined;
  const result = await listFabricsAction({ supplierId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
