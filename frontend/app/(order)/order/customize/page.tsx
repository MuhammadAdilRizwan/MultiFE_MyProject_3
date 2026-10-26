import type { Metadata } from "next";
import { CustomizeAll } from "./customize-all";

export const metadata: Metadata = { title: "Customize your outfit" };

export default function CustomizePage() {
  return <CustomizeAll />;
}
