import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/orders/order-detail";
import { Alert } from "@/components/ui/alert";
import { getMyOrder } from "@/lib/customer-orders";

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ placed?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${decodeURIComponent((await params).number)}` };
}

// An order this agent placed (RLS: "orders: agent reads placed by self").
export default async function AgentOrderPage({ params, searchParams }: Props) {
  const number = decodeURIComponent((await params).number);
  const { placed } = await searchParams;
  if (!/^MF-\d{4}-\d{6}$/.test(number)) notFound();

  const order = await getMyOrder(number, "agent").catch((error: unknown) => {
    console.error("agent getMyOrder failed:", error instanceof Error ? error.message : "unknown error");
    return undefined;
  });
  if (order === null) notFound();

  if (order === undefined) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Alert tone="danger">We couldn&apos;t load this order. Please refresh to try again.</Alert>
      </div>
    );
  }

  return <OrderDetailView order={order} placed={placed === "1"} audience="agent" />;
}
