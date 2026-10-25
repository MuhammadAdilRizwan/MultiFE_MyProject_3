import type { SupplierRow } from "@multife/backend/modules/catalog/types";
import type { EvaluatedOptionGroup } from "@multife/backend/modules/rules/types";
import { createClient } from "@/lib/supabase/server";

// Admin-panel reads. The admin layout already gates on role; RLS ("admin all"
// policies) is what actually lets these see pending suppliers, hidden
// fabrics and unpublished templates.

export type AdminSupplier = Pick<SupplierRow, "id" | "name" | "slug" | "status"> & {
  fabricCount: number;
  unconfirmedCount: number;
};

const hasOptions = (supported: Record<string, string[]> | null) =>
  Object.values(supported ?? {}).some((values) => values.length > 0);

export async function listSuppliersForAdmin(): Promise<AdminSupplier[]> {
  const supabase = await createClient();
  const [{ data: suppliers, error }, { data: fabrics, error: fabricsError }] = await Promise.all([
    supabase.from("suppliers").select("id, name, slug, status").order("name", { ascending: true }),
    supabase.from("fabrics").select("supplier_id, supported_options"),
  ]);
  if (error) throw error;
  if (fabricsError) throw fabricsError;

  return (suppliers ?? []).map((s) => {
    const own = (fabrics ?? []).filter((f) => f.supplier_id === s.id);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      fabricCount: own.length,
      unconfirmedCount: own.filter((f) => !hasOptions(f.supported_options)).length,
    };
  });
}

export async function getSupplierForAdmin(id: string): Promise<Pick<SupplierRow, "id" | "name" | "slug" | "status"> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id, name, slug, status").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export type VocabularyGroup = {
  id: string;
  key: string;
  label: string;
  values: { id: string; key: string; label: string }[];
};

// Our whole customization list (option_groups + option_values), in sort order.
export async function listOptionVocabulary(): Promise<VocabularyGroup[]> {
  const supabase = await createClient();
  const [{ data: groups, error }, { data: values, error: valuesError }] = await Promise.all([
    supabase.from("option_groups").select("id, key, label, sort").order("sort"),
    supabase.from("option_values").select("id, group_id, key, label, sort").order("sort"),
  ]);
  if (error) throw error;
  if (valuesError) throw valuesError;

  return (groups ?? []).map((g) => ({
    id: g.id,
    key: g.key,
    label: g.label,
    values: (values ?? []).filter((v) => v.group_id === g.id).map((v) => ({ id: v.id, key: v.key, label: v.label })),
  }));
}

// The vocabulary in the shape buildSteps() takes, so the admin sees the same
// steps and pictures the customer will.
export const vocabularyAsOffered = (vocabulary: VocabularyGroup[]): EvaluatedOptionGroup[] =>
  vocabulary.map((g) => ({
    groupKey: g.key,
    groupLabel: g.label,
    values: g.values.map((v) => ({ key: v.key, label: v.label, priceDelta: 0, extraLeadDays: 0, isDefault: false })),
  }));
