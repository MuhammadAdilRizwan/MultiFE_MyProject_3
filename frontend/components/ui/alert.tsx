import type { ReactNode } from "react";

type Tone = "danger" | "success" | "warning" | "info";

const toneClasses: Record<Tone, string> = {
  danger: "border-danger/25 bg-danger-soft text-danger",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  info: "border-cyan-bright/25 bg-cyan-bright/10 text-ocean",
};

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}
