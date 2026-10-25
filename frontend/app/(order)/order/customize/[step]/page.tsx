import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStepSlug, stepTitle } from "@/lib/customization";
import { CustomizeStep } from "./customize-step";

type Props = { params: Promise<{ step: string }>; searchParams: Promise<{ return?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: stepTitle((await params).step) ?? "Customize" };
}

export default async function CustomizeStepPage({ params, searchParams }: Props) {
  const [{ step: slug }, { return: ret }] = await Promise.all([params, searchParams]);
  if (!isStepSlug(slug)) notFound();
  return <CustomizeStep slug={slug} returnToReview={ret === "review"} />;
}
