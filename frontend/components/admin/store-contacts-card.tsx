import Link from "next/link";
import type { SupplierContact } from "@multife/backend/modules/suppliers/types";
import { cardClasses } from "@/components/ui/card";
import { formatOrderDate } from "@/lib/order-status";

// Who can sign in to the supplier panel for this store. Contacts join only by
// admin invite (FR-AUTH-03); the invite form opens with this store chosen.
export function StoreContactsCard({ storeId, contacts }: { storeId: string; contacts: SupplierContact[] }) {
  const inviteHref = `/admin/invite?role=supplier_contact&supplier=${encodeURIComponent(storeId)}`;
  return (
    <section className={`${cardClasses} p-5 sm:p-6`} aria-labelledby="store-contacts-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="store-contacts-heading" className="text-base font-extrabold tracking-tight text-ink">
            Store contacts
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            They see this store&apos;s fabrics, stock and fabric needed — never customers, measurements or prices.
          </p>
        </div>
        <Link
          href={inviteHref}
          className="inline-flex h-10 items-center rounded-full border border-white/30 bg-mf-blue px-4 text-sm font-bold text-white shadow-blue"
        >
          Invite a contact
        </Link>
      </div>

      {contacts.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line bg-white px-4 py-6 text-center text-sm text-muted">
          No one from this store can sign in yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {contacts.map((c) => (
            <li key={c.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-ink">{c.fullName || c.email || "Store contact"}</span>
                <span className="block truncate text-xs text-muted">
                  {c.fullName && c.email ? `${c.email} · ` : ""}Added {formatOrderDate(c.linkedAt)}
                </span>
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  c.status === "active" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                }`}
              >
                {c.status === "active" ? "Active" : "Suspended"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
