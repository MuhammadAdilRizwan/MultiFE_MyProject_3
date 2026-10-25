"use client";

import { useRouter } from "next/navigation";
import { ActionBar, ArrowIcon } from "@/components/order/action-bar";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { startDraft } from "@/lib/order-draft";

// `blocked` explains why this fabric can't be ordered yet (unconfirmed
// customizations, or no template it can be made in).
export function ContinueToTemplates({
  brandSlug,
  fabricId,
  blocked,
}: {
  brandSlug: string;
  fabricId: string;
  blocked: string | null;
}) {
  const router = useRouter();
  return (
    <ActionBar backHref={`/s/${brandSlug}`} backLabel="Choose another fabric">
      {blocked && (
        <div className="mb-2 w-full">
          <Alert tone="info">{blocked}</Alert>
        </div>
      )}
      <button
        type="button"
        disabled={Boolean(blocked)}
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
