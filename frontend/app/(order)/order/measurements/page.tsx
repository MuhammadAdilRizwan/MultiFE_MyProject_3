import type { Metadata } from "next";
import { MeasurementsPage } from "./measurements-form";

export const metadata: Metadata = { title: "Your measurements" };

export default function Page() {
  return <MeasurementsPage />;
}
