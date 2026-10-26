import Image from "next/image";

export function SelectedBadge() {
  return (
    <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-mf-orange text-white shadow-md">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

export function optionCardClasses(selected: boolean) {
  return `group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-bright/30 ${
    selected
      ? "border-cyan-bright shadow-[0_14px_30px_rgba(16,182,217,0.16)] ring-1 ring-cyan-bright"
      : "border-line hover:-translate-y-0.5 hover:border-cyan-bright/50 hover:shadow-card"
  }`;
}

// `image` is null for a value with no picture yet. In a group where no value
// has one (`textOnly`), cards drop the picture area altogether.
export function OptionCard({
  label,
  image,
  selected,
  onSelect,
  textOnly = false,
  extra,
  sizes = "(min-width: 1024px) 160px, (min-width: 640px) 22vw, 30vw",
}: {
  label: string;
  image: string | null;
  selected: boolean;
  onSelect: () => void;
  textOnly?: boolean;
  // e.g. "+PKR 300" when this choice costs extra
  extra?: string;
  sizes?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={optionCardClasses(selected)}>
      {selected && <SelectedBadge />}
      {!textOnly && (
        <span className="relative flex aspect-square w-full items-center justify-center bg-cream">
          {image ? (
            <Image src={image} alt="" fill sizes={sizes} className="object-cover" />
          ) : (
            <span aria-hidden="true" className="font-display text-3xl text-hint">
              {label.charAt(0)}
            </span>
          )}
        </span>
      )}
      <span className="flex min-h-[3rem] flex-col items-center justify-center px-2 py-2 text-center text-xs font-bold leading-tight text-ink sm:text-sm">
        {label}
        {extra && <span className="mt-0.5 text-[11px] font-semibold text-ocean">{extra}</span>}
      </span>
    </button>
  );
}
