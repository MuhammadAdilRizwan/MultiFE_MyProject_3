import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

// Always per-request: every page here reads the signed-in customer's session.
export const dynamic = "force-dynamic";

// Customer account (FR-CUS-15). Middleware already limits /account to signed-in customers.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
