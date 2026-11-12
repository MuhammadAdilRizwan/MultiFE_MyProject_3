import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/orders/order-detail";
import { Alert } from "@/components/ui/alert";
import { getMyOrder } from "@/lib/customer-orders";

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

  // The admin layout already pads the page; the view brings its own width.
  return (
    <div className="-mx-4 -my-8 sm:-mx-6 sm:-my-10 lg:-mx-8">
      <OrderDetailView order={order} placed={false} audience="admin" />
    </div>
  );
}
