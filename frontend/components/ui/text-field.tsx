import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClasses =
  "block h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-navy placeholder:text-hint transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-ice aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15";

type FieldShellProps = {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
};

export function FieldShell({ id, label, error, hint, optional, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-navy">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-hint">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
};

export function TextField({ id, label, error, hint, optional, ...input }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional}>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClasses}
        {...input}
      />
    </FieldShell>
  );
}
