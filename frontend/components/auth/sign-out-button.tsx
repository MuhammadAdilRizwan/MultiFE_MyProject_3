"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { signOutAction } from "@/app/(auth)/actions";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
          router.replace("/");
          router.refresh();
        })
      }
      className="inline-flex h-11 items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-navy transition-colors hover:border-accent hover:text-ocean disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
