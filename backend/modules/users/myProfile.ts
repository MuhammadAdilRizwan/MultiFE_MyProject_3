import type { AnySupabaseClient } from "./types";

// FR-CUS-16: the signed-in user's own details, as shown and edited on the
// account page. Runs on the user's session; RLS ("profiles: read own" /
// "profiles: update own") limits both to their own row, and the
// guard_admin_columns trigger keeps role and status out of reach. Email is
// the sign-in identity and is read-only here.

export interface SavedAddress {
  address_line: string;
  city: string;
}

export interface MyProfile {
  fullName: string;
  phone: string | null;
  email: string | null;
  address: SavedAddress | null;
}

type Row = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  delivery_address: Partial<SavedAddress> | null;
};

const toAddress = (raw: Row["delivery_address"]): SavedAddress | null =>
  raw && typeof raw.address_line === "string" && typeof raw.city === "string"
    ? { address_line: raw.address_line, city: raw.city }
    : null;

export async function getMyProfile(supabase: AnySupabaseClient, userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, phone, email, delivery_address")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Row;
  return { fullName: row.full_name ?? "", phone: row.phone, email: row.email, address: toAddress(row.delivery_address) };
}

export interface UpdateMyProfileParams {
  userId: string;
  // Already validated and normalised by the caller (phone in +92… form).
  fullName: string;
  phone: string | null;
  address: SavedAddress | null;
}

export async function updateMyProfile(supabase: AnySupabaseClient, params: UpdateMyProfileParams): Promise<MyProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: params.fullName, phone: params.phone, delivery_address: params.address })
    .eq("id", params.userId)
    .select("full_name, phone, email, delivery_address")
    .single();
  if (error) throw error;
  const row = data as Row;
  return { fullName: row.full_name ?? "", phone: row.phone, email: row.email, address: toAddress(row.delivery_address) };
}
