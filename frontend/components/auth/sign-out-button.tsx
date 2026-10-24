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
      className="inline-flex h-11 items-center justify-center rounded-full border border-line bg-white/80 px-4 text-sm font-semibold text-ink backdrop-blur transition-transform duration-200 hover:-translate-y-px hover:border-cyan-bright/60 hover:text-ocean disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
