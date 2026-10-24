import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

const variantClasses: Record<Variant, string> = {
  primary: "border border-white/30 bg-mf-blue text-white shadow-blue",
  secondary: "border border-line bg-white/80 text-ink backdrop-blur hover:border-cyan-bright/60 hover:text-ocean",
};

export const buttonClasses = (variant: Variant = "primary") =>
  `inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-semibold transition-transform duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.985] focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-bright/30 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]}`;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;
  pendingLabel?: string;
};

export function Button({
  variant = "primary",
  pending = false,
  pendingLabel,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${buttonClasses(variant)} ${className}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
