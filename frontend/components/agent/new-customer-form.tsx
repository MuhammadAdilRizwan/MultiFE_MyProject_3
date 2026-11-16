"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createProvisionalCustomerAction } from "@/app/(agent)/agent-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toInternationalPhone } from "@/lib/phone";

// The action passes Supabase's own wording through; these are common enough
// to deserve plain messages.
export function friendlyCustomerError(error: string): string {
  if (/already (been )?registered|already exists/i.test(error)) {
    return /phone/i.test(error)
      ? "A customer with this phone number already exists."
      : "An account with this email already exists. The customer can sign in with it directly.";
  }
  if (/rate limit|too many/i.test(error)) return "Too many invite emails were sent just now. Please try again in a while.";
  return error;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AddedCustomer = { customerId: string; name: string; email: string };

// Name, email (invite goes here) and mobile number for a new customer the
// agent is helping (FR-AGT-04). Used in the agent panel and when an agent
// picks who an order is for at the end of the order flow.
export function NewCustomerForm({
  idPrefix,
  submitLabel,
  onAdded,
}: {
  idPrefix: string;
  submitLabel: string;
  onAdded: (customer: AddedCustomer) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ email?: string; phone?: string; form?: string }>({});
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const found: typeof errors = {};
    if (!EMAIL_PATTERN.test(cleanEmail)) found.email = "Enter the customer's email address.";
    const international = phone.trim() ? toInternationalPhone(phone) : null;
    if (phone.trim() && !international) found.phone = "Enter a valid mobile number, e.g. 0300 1234567.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const name = fullName.trim();
    startSaving(async () => {
      const result = await createProvisionalCustomerAction({
        email: cleanEmail,
        phone: international ?? undefined,
        fullName: name || undefined,
      });
      if (!result.ok) {
        setErrors({ form: friendlyCustomerError(result.error) });
        return;
      }
      setFullName("");
      setEmail("");
      setPhone("");
      onAdded({ customerId: result.data.customerId, name, email: cleanEmail });
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        id={`${idPrefix}-name`}
        label="Full name"
        optional
        autoComplete="off"
        maxLength={80}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <TextField
        id={`${idPrefix}-email`}
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        maxLength={254}
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextField
        id={`${idPrefix}-phone`}
        label="Mobile number"
        optional
        type="tel"
        inputMode="tel"
        autoComplete="off"
        maxLength={20}
        placeholder="0300 1234567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
      />

      {errors.form && <Alert tone="danger">{errors.form}</Alert>}

      <Button type="submit" pending={saving} pendingLabel="Adding…" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
