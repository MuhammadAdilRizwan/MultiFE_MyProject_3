import type { ReactNode } from "react";

type Align = "center" | "responsive";

// "responsive" = centred on phones, left-aligned from lg up (used by the hero).
const alignWrap: Record<Align, string> = {
  center: "justify-center",
  responsive: "justify-center lg:justify-start",
};
const alignRule: Record<Align, string> = {
  center: "mx-auto",
  responsive: "mx-auto lg:mx-0",
};

export function Eyebrow({ children, align = "center" }: { children: ReactNode; align?: Align }) {
  return (
    <span className={`flex items-center gap-3 ${alignWrap[align]}`}>
      <span aria-hidden="true" className="h-px w-8 bg-orange" />
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-alt">
        {children}
      </span>
      <span aria-hidden="true" className="h-px w-8 bg-orange" />
    </span>
  );
}

export function HeadingRule({ align = "center" }: { align?: Align }) {
  return <span aria-hidden="true" className={`mt-4 block h-[3px] w-[42px] rounded-full bg-mf-rule ${alignRule[align]}`} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-balance font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
        {title}
      </h2>
      <HeadingRule />
      {description && <p className="mt-5 text-base leading-7 text-muted-alt">{description}</p>}
    </div>
  );
}

export const landingPrimaryButton =
  "inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-mf-blue px-7 text-base font-semibold text-white shadow-blue transition-transform duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.985] focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-bright/30";

export const landingSecondaryButton =
  "inline-flex h-12 items-center justify-center rounded-full border border-ink-line bg-white/80 px-7 text-base font-semibold text-ink backdrop-blur transition-transform duration-200 hover:-translate-y-px hover:border-cyan-bright/60 active:translate-y-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-bright/30";

export const landingCard = "rounded-3xl border border-ink-line bg-white/80 shadow-card backdrop-blur-xl";
