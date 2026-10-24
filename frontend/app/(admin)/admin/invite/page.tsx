import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, type SupplierOption } from "./invite-form";

export const metadata: Metadata = { title: "Invite users" };

export default async function InvitePage() {
  const supabase = await createClient();
  // Admins read every supplier (RLS "suppliers: admin all"), including pending
  // ones — a contact may be invited before the supplier goes live.
  const { data } = await supabase
    .from("suppliers")
    .select("id, name, status")
    .order("name", { ascending: true });

  const suppliers: SupplierOption[] = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
  }));

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl font-semibold leading-tight text-navy sm:text-5xl">
          Invite a team member
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Agents, production staff, supplier contacts and admins can only join by invite. They&apos;ll
          get an email with a link to set their password.
        </p>
      </div>
      <div className="mt-8">
        <InviteForm suppliers={suppliers} />
      </div>
    </div>
  );
}
