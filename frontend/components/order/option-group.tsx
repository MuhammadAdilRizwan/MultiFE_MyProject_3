"use client";

import type { KeyboardEvent } from "react";
import { formatPKR } from "@/lib/catalog";
import type { Group } from "@/lib/customization";
import { OptionCard } from "./option-card";

// Fewer options get wider cards, matching the prototype (3-up for 3 options).
function gridFor(count: number) {
  if (count <= 3) return "grid-cols-3 sm:max-w-xl";
  if (count === 4) return "grid-cols-2 min-[420px]:grid-cols-4";
  return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
}

export function OptionGroup({
  group,
  index,
  value,
  onChange,
}: {
  group: Group;
  index: number;
  value: string;
  onChange: (optionId: string) => void;
}) {
  const headingId = `group-${group.id}`;
  const textOnly = group.options.every((o) => !o.image);

  // Arrow keys move the selection within the group, like a native radio group.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const i = group.options.findIndex((o) => o.id === value);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = group.options[(i + step + group.options.length) % group.options.length];
    onChange(next.id);
    const btn = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[group.options.indexOf(next)];
    btn?.focus();
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center gap-3">
        <h2 id={headingId} className="flex-none text-base font-bold tracking-tight text-ink">
          <span className="text-ocean">{index}.</span> {group.title}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-orange/70 to-transparent" />
      </div>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={onKeyDown}
        className={`mt-4 grid gap-3 sm:gap-4 ${gridFor(group.options.length)}`}
      >
        {group.options.map((o) => (
          <OptionCard
            key={o.id}
            label={o.label}
            image={o.image}
            textOnly={textOnly}
            extra={o.priceDelta > 0 ? `+${formatPKR(o.priceDelta)}` : undefined}
            selected={o.id === value}
            onSelect={() => onChange(o.id)}
          />
        ))}
      </div>
    </section>
  );
}
