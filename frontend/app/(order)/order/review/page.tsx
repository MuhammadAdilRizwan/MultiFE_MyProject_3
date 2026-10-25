import type { Metadata } from "next";
import { FinalReview } from "./final-review";

export const metadata: Metadata = { title: "Final customization review" };

export default function ReviewPage() {
  return <FinalReview />;
}
