"use client";

import { useState, useTransition, type FormEvent } from "react";
import { inputClasses } from "@/components/ui/text-field";
import { setUserRoleAction } from "./actions";

const ROLES = [
  { value: "customer", label: "Customer" },
  { value: "agent", label: "Agent" },
  { value: "tailor", label: "Tailor" },
  { value: "qc", label: "QC" },
  { value: "dispatch", label: "Dispatch" },
  { value: "admin", label: "Admin" },
] as const;

type Role = (typeof ROLES)[number]["value"];

// FR-ADM-05: change one account's role from the users list. Store contacts
// are invited (they need a store), so they're not offered here.
export function RoleControl({ userId, name, role, isSelf }: { userId: string; name: string; role: string; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState<Role>((ROLES.some((r) => r.value === role) ? role : "customer") as Role);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (isSelf || role === "supplier_contact") return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await setUserRoleAction({ userId, role: next, agentCode: next === "agent" ? code.trim() : undefined });
      if (!result.ok) setError(result.error);
      else setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-9 rounded-full border border-line bg-white px-4 text-xs font-bold text-ink transition-colors hover:border-cyan-bright/60 hover:text-ocean"
      >
        Change role
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-2xl border border-line bg-cream/60 p-3 sm:w-72">
      <label htmlFor={`role-${userId}`} className="text-xs font-semibold text-ink">
        New role for {name}
      </label>
      <select
        id={`role-${userId}`}
        value={next}
        onChange={(e) => setNext(e.target.value as Role)}
        className={`${inputClasses} mt-1 h-10 text-sm`}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {next === "agent" && role !== "agent" && (
        <>
          <label htmlFor={`code-${userId}`} className="mt-2 block text-xs font-semibold text-ink">
            Agent code
          </label>
          <input
            id={`code-${userId}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. AG-012 (leave blank to keep an old one)"
            maxLength={20}
            className={`${inputClasses} mt-1 h-10 text-sm`}
          />
        </>
      )}
      {next === "admin" && role !== "admin" && (
        <p className="mt-2 text-xs text-warning">Admins can see and change everything.</p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending || next === role}
          className="h-9 flex-1 rounded-full border border-white/30 bg-mf-blue px-4 text-xs font-bold text-white shadow-blue disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save role"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          disabled={pending}
          className="h-9 rounded-full border border-line bg-white px-4 text-xs font-bold text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
