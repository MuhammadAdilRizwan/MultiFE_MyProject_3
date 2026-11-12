import Link from "next/link";
import { HeadingRule } from "@/components/ui/heading";
import { inputClasses } from "@/components/ui/text-field";

// Shared pieces for the admin list pages (orders, users). Plain GET forms
// and links, so filters live in the URL and work without JavaScript.

export function PageHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      <HeadingRule align="left" className="mt-4" />
      <p className="mt-4 text-base leading-7 text-muted">{text}</p>
    </div>
  );
}

export function SearchForm({
  action,
  defaultValue,
  placeholder,
  hidden = {},
}: {
  action: string;
  defaultValue: string;
  placeholder: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" role="search" className="flex w-full gap-2 lg:max-w-sm">
      {Object.entries(hidden).map(([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />)}
      <label htmlFor="admin-search" className="sr-only">
        Search
      </label>
      <input id="admin-search" name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} maxLength={60} className={`${inputClasses} h-11`} />
      <button type="submit" className="inline-flex h-11 flex-none items-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink shadow-sm hover:border-cyan-bright/60 hover:text-ocean">
        Search
      </button>
    </form>
  );
}

export function Pager({
  page,
  total,
  pageSize,
  href,
  noun,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-cyan-bright/60 hover:text-ocean";
  return (
    <div className="mt-6 flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {from}–{to} of {total} {noun}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className={link}>
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className={link}>
            Next
          </Link>
        )}
      </span>
    </div>
  );
}
