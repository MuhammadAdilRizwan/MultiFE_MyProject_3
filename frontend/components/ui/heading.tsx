import type { ReactNode } from "react";

type Align = "center" | "left" | "responsive";

// "responsive" = centred on phones, left-aligned from lg up.
const wrapAlign: Record<Align, string> = {
  center: "justify-center",
  left: "justify-start",
  responsive: "justify-center lg:justify-start",
};
const ruleAlign: Record<Align, string> = {
  center: "mx-auto",
  left: "",
  responsive: "mx-auto lg:mx-0",
};

export function Eyebrow({ children, align = "center" }: { children: ReactNode; align?: Align }) {
  return (
    <span className={`flex items-center gap-3 ${wrapAlign[align]}`}>
      <span aria-hidden="true" className="h-px w-8 bg-orange" />
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{children}</span>
      <span aria-hidden="true" className="h-px w-8 bg-orange" />
    </span>
  );
}

// The short cyan → orange line the prototype puts under every main heading.
export function HeadingRule({ align = "center", className = "mt-4" }: { align?: Align; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-[3px] w-[42px] rounded-full bg-mf-rule ${ruleAlign[align]} ${className}`}
    />
  );
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
      <h2 className="mt-4 text-balance font-display text-3xl leading-tight text-ink sm:text-4xl">
        {title}
      </h2>
      <HeadingRule />
      {description && <p className="mt-5 text-base leading-7 text-muted">{description}</p>}
    </div>
  );
}
