"use client";

import { useRouter } from "next/navigation";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { buttonClasses } from "@/components/ui/button";
import { startDraft } from "@/lib/order-draft";

export function ContinueToTemplates({ brandSlug, fabricId }: { brandSlug: string; fabricId: string }) {
  const router = useRouter();
  return (
    <ActionBar backHref={`/s/${brandSlug}`} backLabel="Choose another fabric">
      <button
        type="button"
        onClick={() => {
          startDraft(brandSlug, fabricId);
          router.push("/order/template");
        }}
        className={`${buttonClasses("primary")} w-full`}
      >
        Continue to Templates
        <ArrowIcon />
      </button>
    </ActionBar>
  );
}
