import type { Metadata } from "next";
import { TemplatePreview } from "./template-preview";

export const metadata: Metadata = { title: "Template preview" };

export default function PreviewPage() {
  return <TemplatePreview />;
}
