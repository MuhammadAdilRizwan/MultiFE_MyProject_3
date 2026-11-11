import type { Metadata } from "next";
import { CheckoutPage } from "./checkout";

export const metadata: Metadata = { title: "Checkout" };

export default function Page() {
  return <CheckoutPage />;
}
