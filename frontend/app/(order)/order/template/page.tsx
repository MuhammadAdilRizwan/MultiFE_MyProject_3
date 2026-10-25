import type { Metadata } from "next";
import { TemplateLibrary } from "./template-library";

export const metadata: Metadata = { title: "Choose a template" };

export default function TemplatePage() {
  return <TemplateLibrary />;
}
