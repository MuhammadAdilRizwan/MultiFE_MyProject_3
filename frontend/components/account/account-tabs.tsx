import Link from "next/link";

const TABS = [
  { key: "orders", href: "/account/orders", label: "My orders" },
  { key: "measurements", href: "/account/measurements", label: "Measurements" },
  { key: "profile", href: "/account/profile", label: "My details" },
] as const;

// Switches between the customer's account pages.
export function AccountTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Account" className="mx-auto mt-8 flex w-full max-w-md rounded-full border border-line bg-white p-1 shadow-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`flex h-10 flex-1 items-center justify-center rounded-full px-2 text-[13px] font-semibold transition-colors sm:text-sm ${
            tab.key === active ? "bg-mf-blue text-white shadow-blue" : "text-muted hover:text-ocean"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
