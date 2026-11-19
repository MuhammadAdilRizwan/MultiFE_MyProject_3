import type { Metadata } from "next";
import { HeadingRule } from "@/components/ui/heading";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, type SupplierOption } from "./invite-form";

export const metadata: Metadata = { title: "Invite users" };

// ?role=supplier_contact&supplier=<id> (from a store's "Invite a contact")
// opens the form with that role and store chosen.
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ role?: string; supplier?: string }> }) {
  const params = await searchParams;
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
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
          Invite a team member
        </h1>
        <HeadingRule align="left" className="mt-4" />
        <p className="mt-4 text-base leading-7 text-muted">
          Agents, production staff, supplier contacts and admins can only join by invite. They&apos;ll
          get an email with a link to set their password.
        </p>
      </div>
      <div className="mt-8">
        <InviteForm
          suppliers={suppliers}
          initialRole={params.role === "supplier_contact" ? "supplier_contact" : undefined}
          initialSupplierId={suppliers.some((s) => s.id === params.supplier) ? params.supplier : undefined}
        />
      </div>
    </div>
  );
}
