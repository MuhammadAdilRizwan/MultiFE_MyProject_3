import { NextResponse, type NextRequest } from "next/server";
import { inviteUserAction } from "@/app/(auth)/actions";

// FR-AUTH-03: admin-only, for any of the six invite-only roles (agent,
// tailor, qc, dispatch, supplier_contact, admin). Replaces the separate
// v1.0 invite-admin / invite-shopkeeper routes.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const result = await inviteUserAction(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
