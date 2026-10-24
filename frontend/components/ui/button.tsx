import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "dark";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-glow hover:bg-ocean",
  secondary: "border border-line bg-surface text-navy hover:border-accent hover:text-ocean",
  dark: "bg-navy text-white hover:bg-navy-deep",
};

export const buttonClasses = (variant: Variant = "primary") =>
  `inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]}`;

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
