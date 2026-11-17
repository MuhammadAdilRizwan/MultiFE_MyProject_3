import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listProductionStaff } from "@multife/backend/modules/production/listProductionStaff";
import { OrderProductionCard } from "@/components/admin/order-production";
import { OrderDetailView } from "@/components/orders/order-detail";
import { Alert } from "@/components/ui/alert";
import { getOrderProduction } from "@/lib/admin-production";
import { getMyOrder } from "@/lib/customer-orders";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${decodeURIComponent((await params).number)}` };
}

// Any order, for an admin (FR-ADM-06). RLS "orders: admin all" scopes it.
export default async function AdminOrderPage({ params }: Props) {
  const number = decodeURIComponent((await params).number);
  if (!/^MF-\d{4}-\d{6}$/.test(number)) notFound();

  const order = await getMyOrder(number, "admin").catch((error: unknown) => {
    console.error("getMyOrder (admin) failed:", error instanceof Error ? error.message : "unknown error");
    return undefined;
  });
  if (order === null) notFound();
  if (order === undefined) return <Alert tone="danger">We couldn&apos;t load this order. Please refresh to try again.</Alert>;

  // Production card: who makes it, and the admin's step before the workshop.
  const [production, staff] = await Promise.all([
    getOrderProduction(number),
    createClient().then(listProductionStaff),
  ]).catch((error: unknown) => {
    console.error("order production failed:", error instanceof Error ? error.message : "unknown error");
    return [null, []] as const;
  });

  // The admin layout already pads the page; the view brings its own width.
  return (
    <div className="-mx-4 -my-8 sm:-mx-6 sm:-my-10 lg:-mx-8">
      {production && (
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
          <OrderProductionCard
            orderNumber={number}
            production={production}
            staff={staff.map((s) => ({ id: s.id, name: s.full_name?.trim() || s.email || "Unnamed", role: s.role }))}
          />
        </div>
      )}
      <OrderDetailView order={order} placed={false} audience="admin" />
    </div>
  );
}
