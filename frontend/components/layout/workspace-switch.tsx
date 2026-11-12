import Link from "next/link";

// Moving between the storefront and a staff panel. Staff (agents, admins)
// browse the brands like customers do; these keep their panel one tap away
// without crowding the account controls.

const WORKSPACES = {
  agent: { label: "Agent workspace", href: "/agent", action: "Open agent panel" },
  admin: { label: "Admin workspace", href: "/admin", action: "Open admin panel" },
} as const;

// Slim strip above the storefront header, shown only to staff.
export function StaffBar({ role, detail }: { role: keyof typeof WORKSPACES; detail?: string | null }) {
  const ws = WORKSPACES[role];
  return (
    <div className="bg-ink text-white">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-3 px-4 text-xs sm:px-6 sm:text-sm lg:px-8">
        <p className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-green" />
          <span className="truncate font-semibold">{ws.label}</span>
          {detail && (
            <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80 sm:inline">
              {detail}
            </span>
          )}
          <span className="hidden text-white/60 md:inline">· You&apos;re browsing the storefront</span>
        </p>
        <Link
          href={ws.href}
          className="inline-flex h-7 flex-none items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 font-semibold transition-colors hover:bg-white/20 sm:h-8"
        >
          <PanelIcon />
          {ws.action}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// "View brands" button for a staff panel's header.
export function ViewBrandsLink() {
  return (
    <Link
      href="/brands"
      aria-label="View brands"
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-cyan-bright/60 hover:text-ocean sm:px-4"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d="M4 9.5 5.5 4h13L20 9.5" />
        <path d="M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0" />
        <path d="M5.5 12.5V20h13v-7.5" />
        <path d="M10 20v-4.5h4V20" />
      </svg>
      <span className="hidden sm:inline">View brands</span>
    </Link>
  );
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}
