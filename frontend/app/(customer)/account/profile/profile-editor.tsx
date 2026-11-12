"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { MyProfile } from "@multife/backend/modules/users/myProfile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatPhone } from "@/lib/phone";
import { updateMyProfileAction, type ProfileInput } from "./actions";

const toInputs = (p: MyProfile): ProfileInput => ({
  fullName: p.fullName,
  phone: formatPhone(p.phone),
  addressLine: p.address?.address_line ?? "",
  city: p.address?.city ?? "",
});

export function ProfileEditor({ profile }: { profile: MyProfile }) {
  const [values, setValues] = useState(() => toInputs(profile));
  const email = profile.email;
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const set = (field: keyof ProfileInput) => (e: { target: { value: string } }) => {
    setNotice(null);
    setValues((v) => ({ ...v, [field]: e.target.value }));
  };
  const fieldError = (field: keyof ProfileInput) => (error?.field === field ? error.message : undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startSaving(async () => {
      const result = await updateMyProfileAction(values);
      if (!result.ok) {
        setError({ field: result.field, message: result.error });
        if (result.field) document.getElementById(`p-${result.field}`)?.focus();
        return;
      }
      setValues(toInputs(result.data));
      setNotice("Your details are saved.");
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="rounded-3xl border border-line bg-white/80 p-5 shadow-card backdrop-blur-xl sm:p-7">
        <h2 className="font-display text-2xl text-ink">Contact</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField id="p-fullName" label="Full name" autoComplete="name" required maxLength={80} value={values.fullName} onChange={set("fullName")} error={fieldError("fullName")} />
          <TextField
            id="p-phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            optional
            maxLength={24}
            placeholder="0300 1234567"
            value={values.phone}
            onChange={set("phone")}
            error={fieldError("phone")}
            hint="We call this number about your orders."
          />
        </div>
        {email && (
          <p className="mt-4 text-sm text-muted">
            Signed in as <span className="font-semibold text-ink">{email}</span>
          </p>
        )}

        <h2 className="mt-8 font-display text-2xl text-ink">Delivery address</h2>
        <p className="mt-1 text-sm text-muted">Optional. Saved here, it&apos;s filled in for you at checkout.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_14rem]">
          <TextField
            id="p-addressLine"
            label="Address"
            autoComplete="street-address"
            optional
            maxLength={200}
            placeholder="House, street, area"
            value={values.addressLine}
            onChange={set("addressLine")}
            error={fieldError("addressLine")}
          />
          <TextField id="p-city" label="City" autoComplete="address-level2" optional maxLength={60} value={values.city} onChange={set("city")} error={fieldError("city")} />
        </div>

        {error && !error.field && (
          <div className="mt-4">
            <Alert tone="danger">{error.message}</Alert>
          </div>
        )}

        <Button type="submit" pending={saving} pendingLabel="Saving…" className="mt-6 w-full">
          Save details
        </Button>
      </section>
    </form>
  );
}
