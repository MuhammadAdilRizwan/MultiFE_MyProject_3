export function StepProgress({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between text-xs font-semibold text-muted">
        <span>{label}</span>
        <span>
          Step {current} of {total}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Customization step ${current} of ${total}`}
      >
        <div className="h-full rounded-full bg-mf-rule transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
