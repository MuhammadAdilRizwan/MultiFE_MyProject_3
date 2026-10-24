"use client";

import { useState, useTransition, type FormEvent } from "react";
import { inviteUserAction } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { FieldShell, TextField, inputClasses } from "@/components/ui/text-field";

type InviteRole = "agent" | "tailor" | "qc" | "dispatch" | "supplier_contact" | "admin";

export type SupplierOption = { id: string; name: string; status: string };

const ROLES: { value: InviteRole; label: string; description: string }[] = [
  { value: "agent", label: "Field agent", description: "Guides customers and places orders for them." },
  { value: "tailor", label: "Tailor", description: "Approves measurements, cuts and stitches." },
  { value: "qc", label: "Quality control", description: "Checks finished garments before dispatch." },
  { value: "dispatch", label: "Dispatch", description: "Packs orders and records courier tracking." },
  { value: "supplier_contact", label: "Supplier contact", description: "Sees their own fabric and supply orders only." },
  { value: "admin", label: "Admin", description: "Full access to manage the platform." },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"email" | "supplierId", string>>;

export function InviteForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<InviteRole>("agent");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [agentCode, setAgentCode] = useState("");
  const [region, setRegion] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; role: string } | null>(null);

  const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSent(null);

    const found: Errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) found.email = "Enter a valid email address.";
    if (role === "supplier_contact" && !supplierId) found.supplierId = "Choose the supplier this contact belongs to.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      const result = await inviteUserAction({
        role,
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        agentCode: role === "agent" ? agentCode.trim() || undefined : undefined,
        region: role === "agent" ? region.trim() || undefined : undefined,
        supplierId: role === "supplier_contact" ? supplierId : undefined,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setSent({ email: email.trim(), role: roleLabel });
      setEmail("");
      setFullName("");
      setAgentCode("");
      setRegion("");
      setSupplierId("");
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`${cardClasses} grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10`}
    >
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Role</legend>
        <p className="mt-1 text-sm text-muted">Each role only sees what its job needs.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((option) => {
            const checked = role === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                  checked
                    ? "border-cyan-bright bg-cyan-bright/10 shadow-[0_14px_30px_rgba(16,182,217,0.13)]"
                    : "border-line bg-white/80 hover:border-cyan-bright/60"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={checked}
                  onChange={() => {
                    setRole(option.value);
                    setErrors({});
                  }}
                  className="mt-0.5 h-4 w-4 flex-none accent-ocean"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-5">
        {sent && (
          <Alert tone="success">
            Invite sent to <strong className="font-semibold">{sent.email}</strong> as {sent.role}.
          </Alert>
        )}
        {formError && <Alert tone="danger">{formError}</Alert>}

        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="off"
          inputMode="email"
          placeholder="name@example.com"
          required
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="fullName"
          label="Full name"
          optional
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        {role === "agent" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id="agentCode"
              label="Agent code"
              optional
              autoComplete="off"
              placeholder="Auto if blank"
              value={agentCode}
              onChange={(e) => setAgentCode(e.target.value)}
            />
            <TextField
              id="region"
              label="Region"
              optional
              autoComplete="off"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
        )}

        {role === "supplier_contact" &&
          (suppliers.length > 0 ? (
            <FieldShell id="supplierId" label="Supplier" error={errors.supplierId}>
              <select
                id="supplierId"
                name="supplierId"
                value={supplierId}
                aria-invalid={errors.supplierId ? true : undefined}
                aria-describedby={errors.supplierId ? "supplierId-error" : undefined}
                onChange={(e) => setSupplierId(e.target.value)}
                className={inputClasses}
              >
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.status !== "active" ? ` (${s.status})` : ""}
                  </option>
                ))}
              </select>
            </FieldShell>
          ) : (
            <Alert tone="warning">
              No suppliers exist yet. A supplier has to be onboarded before you can invite its
              contact.
            </Alert>
          ))}

        <Button
          type="submit"
          className="w-full"
          pending={pending}
          pendingLabel="Sending invite…"
          disabled={role === "supplier_contact" && suppliers.length === 0}
        >
          Send invite
        </Button>
      </div>
    </form>
  );
}
