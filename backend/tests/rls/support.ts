// Shared scaffolding for RLS isolation tests (WBS 1.4). RLS is enforced by
// Postgres, so this can't be mocked like modules/users/*.test.ts — it runs
// against the real project configured in .env (same approach as
// tests/auth.mjs), creating throwaway fixtures and deleting them afterwards.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env to run RLS tests.",
  );
}

export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

export function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false } });
}

const stamp = Date.now();
export function uniqueSlug(tag: string) {
  return `${tag}-${stamp}-${Math.random().toString(36).slice(2, 7)}`;
}

const cleanupUserIds: string[] = [];
const cleanupSupplierIds: string[] = [];
const cleanupOrderIds: string[] = [];
const cleanupDraftIds: string[] = [];
const cleanupMeasurementProfileIds: string[] = [];
const cleanupFabricIds: string[] = [];
const cleanupTemplateIds: string[] = [];

// Creates a confirmed auth user with the given role already set (bypassing
// RLS via the service-role client, mirroring what handle_new_user +
// inviteUser's fix-up do together in the real app).
export async function createUserWithRole(
  role: "customer" | "agent" | "tailor" | "qc" | "dispatch" | "supplier_contact" | "admin",
  tag: string,
) {
  const email = `multife-rls-${uniqueSlug(tag)}@multife-test.local`;
  const password = "Sup3rSecret!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: tag },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const userId = data.user.id;
  cleanupUserIds.push(userId);

  if (role !== "customer") {
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", userId);
    if (roleError) throw roleError;
  }

  return { userId, email, password };
}

// Signs in as the given fixture and returns a client scoped to that session
// (subject to RLS), matching how a real request would read data.
export async function signedInClient(fixture: { email: string; password: string }) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword(fixture);
  if (error) throw error;
  return client;
}

export async function createAgent(tag: string) {
  const user = await createUserWithRole("agent", tag);
  const { data, error } = await admin
    .from("agents")
    .insert({ profile_id: user.userId, code: uniqueSlug("AG").toUpperCase() })
    .select("id")
    .single();
  if (error) throw error;
  return { ...user, agentId: data.id as string };
}

export async function assignCustomerToAgent(agentId: string, customerId: string) {
  const { error } = await admin.from("agent_customers").insert({ agent_id: agentId, customer_id: customerId });
  if (error) throw error;
}

export async function createSupplier(tag: string, status: "pending" | "active" | "suspended") {
  // suppliers.slug must be lowercase-hyphen (suppliers_slug_check); `tag` is
  // a human-readable label and may contain spaces/uppercase.
  const slug = uniqueSlug(tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-+|-+$/g, "");
  const { data, error } = await admin.from("suppliers").insert({ name: tag, slug, status }).select("id").single();
  if (error) throw error;
  const supplierId = data.id as string;
  cleanupSupplierIds.push(supplierId);
  return supplierId;
}

export async function createSupplierContact(tag: string, supplierId: string) {
  const user = await createUserWithRole("supplier_contact", tag);
  const { error } = await admin.from("supplier_contacts").insert({ supplier_id: supplierId, user_id: user.userId });
  if (error) throw error;
  return user;
}

// Builds a minimal placed-and-in-production order, bypassing checkout
// entirely (payments/measurements-confirmation aren't built yet): supplier
// -> fabric -> template (no required_measurements, so approveForProduction
// has nothing to validate) -> customer -> confirmed measurement profile ->
// draft -> hard reservation -> fn_create_order_from_draft, called directly
// via the service-role client exactly as the real payment webhook will.
export async function createOrderInProduction(tag: string) {
  const supplierId = await createSupplier(tag, "active");

  const { data: fabric, error: fabricError } = await admin
    .from("fabrics")
    .insert({ supplier_id: supplierId, external_id: uniqueSlug("ext"), name: tag, price_per_metre: 1000, stock_metres: 100 })
    .select("id")
    .single();
  if (fabricError) throw fabricError;
  const fabricId = fabric.id as string;
  cleanupFabricIds.push(fabricId);

  const slug = uniqueSlug(tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-+|-+$/g, "");
  const { data: template, error: templateError } = await admin
    .from("dress_templates")
    .insert({ name: tag, slug, base_stitch_price: 500, required_measurements: [] })
    .select("id")
    .single();
  if (templateError) throw templateError;
  const templateId = template.id as string;
  cleanupTemplateIds.push(templateId);

  const customer = await createUserWithRole("customer", tag);

  const { data: profile, error: profileError } = await admin
    .from("measurement_profiles")
    .insert({
      customer_id: customer.userId,
      measurement_values: {},
      confirmed_by_id: customer.userId,
      confirmed_by_role: "customer",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (profileError) throw profileError;
  const measurementProfileId = profile.id as string;
  cleanupMeasurementProfileIds.push(measurementProfileId);

  const { data: draft, error: draftError } = await admin
    .from("order_drafts")
    .insert({
      customer_id: customer.userId,
      fabric_id: fabricId,
      template_id: templateId,
      measurement_profile_id: measurementProfileId,
      options: {},
    })
    .select("id")
    .single();
  if (draftError) throw draftError;
  const draftId = draft.id as string;
  cleanupDraftIds.push(draftId);

  const { error: reservationError } = await admin
    .from("fabric_reservations")
    .insert({ fabric_id: fabricId, order_draft_id: draftId, metres: 2, kind: "hard", status: "active" });
  if (reservationError) throw reservationError;

  const { data: order, error: orderError } = await admin.rpc("fn_create_order_from_draft", {
    p_draft_id: draftId,
    p_amount: 2000,
    p_gateway_ref: uniqueSlug("pay"),
    p_event_id: uniqueSlug("evt"),
  });
  if (orderError) throw orderError;
  const orderId = (order as { id: string }).id;
  cleanupOrderIds.push(orderId);

  // Advance past the warehouse-receipt steps so the job is actually
  // approvable — fn_approve_for_production requires the order to already be
  // at received_at_hub (placed -> fabric_secured -> received_at_hub, both
  // admin/system steps ahead of the tailor/QC-only cutting gate).
  // Since 20261117500000 placing an order secures the fabric and assigns the
  // job by itself; only secure it here if that didn't happen.
  const { data: placed } = await admin.from("orders").select("status").eq("id", orderId).single();
  if ((placed as { status: string } | null)?.status === "placed") {
    const { error: secureError } = await admin.rpc("fn_transition_order", {
      p_order_id: orderId,
      p_to_status: "fabric_secured",
      p_actor_role: "admin",
    });
    if (secureError) throw secureError;
  }
  const { error: receiveError } = await admin.rpc("fn_transition_order", {
    p_order_id: orderId,
    p_to_status: "received_at_hub",
    // fabric_secured -> received_at_hub requires p_actor_role in
    // ('tailor', 'qc') OR a real signed-in admin (v_is_admin, which a
    // service-role call — no auth.uid() — can never satisfy); 'admin' alone
    // doesn't pass this branch's check the way it did for the previous one.
    p_actor_role: "tailor",
  });
  if (receiveError) throw receiveError;

  const { data: job, error: jobError } = await admin
    .from("production_jobs")
    .select("id")
    .eq("order_id", orderId)
    .single();
  if (jobError) throw jobError;

  // Tests assign the job themselves: undo the automatic assignment so every
  // caller starts from the same unassigned job.
  const { error: unassignError } = await admin.from("production_jobs").update({ assigned_to_id: null }).eq("id", job.id);
  if (unassignError) throw unassignError;

  return { orderId, jobId: job.id as string, customerId: customer.userId, fabricId, templateId };
}

export async function cleanupAll() {
  // orders.{fabric_id,template_id} are "on delete restrict" and
  // orders.customer_id too, so the order itself must go before its fabric,
  // template and customer can be deleted below.
  for (const [table, ids] of [
    ["orders", cleanupOrderIds],
    ["order_drafts", cleanupDraftIds],
    ["measurement_profiles", cleanupMeasurementProfileIds],
    ["fabrics", cleanupFabricIds],
    ["dress_templates", cleanupTemplateIds],
  ] as const) {
    for (const id of ids) {
      try {
        await admin.from(table).delete().eq("id", id);
      } catch {
        // best-effort cleanup
      }
    }
  }
  for (const id of cleanupUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {}); // cascades profiles/agents/agent_customers/supplier_contacts
  }
  for (const id of cleanupSupplierIds) {
    try {
      await admin.from("suppliers").delete().eq("id", id);
    } catch {
      // best-effort cleanup
    }
  }
}
