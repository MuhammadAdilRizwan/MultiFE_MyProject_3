import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStep } from "@/lib/customization";
import { CustomizeStep } from "./customize-step";

type Props = { params: Promise<{ step: string }>; searchParams: Promise<{ return?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const step = getStep((await params).step);
  return { title: step ? step.title : "Customize" };
}

export default async function CustomizeStepPage({ params, searchParams }: Props) {
  const [{ step: slug }, { return: ret }] = await Promise.all([params, searchParams]);
  if (!getStep(slug)) notFound();
  return <CustomizeStep slug={slug} returnToReview={ret === "review"} />;
}
