-- =============================================================================
-- MultiFe v2.0 — database schema (Supabase / Postgres)
-- Source: MultiFe SDS v2.0 §4 Data Design, §5 Supplier option sets, §6 Fabric/
-- yardage/reservations, §7 Order lifecycle, §9 Supplier integration,
-- §10 Agents/production, §12 Security design.
--
-- v2.0 is a manufacturer model, not a marketplace: MultiFe owns the template
-- library, buys fabric from suppliers, stitches in its own warehouse and
-- ships. Tenancy is role-scoped (agent/tailor/supplier_contact), not
-- shop-scoped — there is no shop_id anywhere in this file.
--
-- Run order matters: enums → helpers → tables → functions → RLS → storage.
-- Safe to run once on a fresh Supabase project (SQL editor or `supabase db push`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type public.app_role             as enum (
  'customer', 'agent', 'tailor', 'qc', 'dispatch', 'supplier_contact', 'admin'
);
create type public.account_status       as enum ('active', 'suspended');
create type public.supplier_status      as enum ('pending', 'active', 'suspended');
create type public.integration_status   as enum ('pending', 'active', 'error');
create type public.measurement_source   as enum ('ai', 'manual', 'agent', 'production_corrected');

-- SRS v2 FR-ORD-02 / SDS v2 §7.2. "received_at_hub" is in the SDS transition
-- table (warehouse's physical fabric receipt) but not spelled out in the SRS's
-- prose list of 9 states — kept here because it is the state the cutting-gate
-- guard logic in §7 depends on. Flagged as a DB gap in STATUS.md.
create type public.order_status         as enum (
  'placed', 'fabric_secured', 'received_at_hub', 'measurements_approved',
  'in_cutting', 'in_stitching', 'in_qc', 'ready_to_ship', 'dispatched', 'delivered',
  'cancelled', 'failed'
);
create type public.order_channel        as enum ('self_serve', 'agent_assisted', 'agent_placed');
create type public.order_payment_status as enum ('unpaid', 'paid', 'refund_pending', 'refunded');
create type public.payment_method       as enum ('online', 'cash_on_delivery');  -- FR-PAY-07: COD is P2, agent-placed only
create type public.payment_status       as enum ('pending', 'paid', 'failed', 'refunded');
create type public.payment_kind         as enum ('charge', 'refund');
create type public.production_stage     as enum (
  'pending', 'approved', 'cutting', 'stitching', 'qc', 'passed', 'failed'
);
create type public.reservation_kind     as enum ('soft', 'hard');
create type public.reservation_status   as enum ('active', 'released', 'expired', 'converted');
create type public.consent_type         as enum ('agent_on_behalf', 'camera_use', 'whatsapp_messaging');
create type public.shipment_status      as enum (
  'pending', 'dispatched', 'delivered', 'delivery_failed', 'ready_for_collection', 'completed'
);
create type public.outbox_status        as enum ('pending', 'sent', 'failed');
create type public.notification_channel as enum ('email', 'whatsapp');


-- -----------------------------------------------------------------------------
-- 2. Generic trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Tables (SDS v2 §4.2). Every table: id uuid PK, created_at, updated_at.
--    Money: numeric(12,2) in PKR. Lengths: numeric, cm. Yardage: numeric, metres.
-- -----------------------------------------------------------------------------

-- profiles: one row per auth user. Agents create provisional customers with no
-- credentials (FR-AUTH-10) by creating an unconfirmed auth user (phone only,
-- no password) through the Admin API — is_provisional flags that row until the
-- customer verifies the phone by OTP, which handle_phone_confirmed (§8) clears.
create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  role                        public.app_role       not null default 'customer',
  full_name                   text,
  phone                       text,
  email                       text,
  status                      public.account_status not null default 'active',
  whatsapp_opt_in             boolean               not null default false,  -- FR-NOT-07
  is_provisional              boolean               not null default false,  -- FR-AUTH-10
  provisional_created_by_id   uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- =============================================================================
-- Catalogue (SDS v2 §4.2 "Catalogue")
-- =============================================================================

-- suppliers: replaces shops. One per partner retailer (Khadi is first).
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status      public.supplier_status not null default 'pending',
  logo_url    text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  contact     jsonb not null default '{}'::jsonb check (jsonb_typeof(contact) = 'object'),  -- { email, phone }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- supplier_contacts: replaces shop_members. Much narrower — see RLS in §12.
create table public.supplier_contacts (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (supplier_id, user_id)
);

-- supplier_integrations: FR-FAB-13 — capabilities declared per supplier, not
-- assumed. The platform degrades per missing capability (SDS v2 §9.1).
create table public.supplier_integrations (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null unique references public.suppliers (id) on delete cascade,
  provider_kind  text not null,  -- adapter key, e.g. 'khadi', 'csv_import', 'manual'
  base_url       text,
  credentials_ref text,  -- reference into a secret store; never the credential itself (FR-FAB-14)
  capabilities   jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
    -- { "catalogue_read": bool, "stock_read": bool, "order_write": bool, "status_callback": bool }
  status         public.integration_status not null default 'pending',
  last_sync_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- integration_sync_runs: feeds the admin sync health view (FR-ADM-07).
create table public.integration_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers (id) on delete cascade,
  kind          text not null default 'catalogue',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count  integer not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- fabrics: synced from a supplier's POS feed. supported_options is authoritative
-- for what a fabric can be made into — MultiFe authors no rules of its own
-- (SDS v2 §5). Never hard-deleted: past orders reference a fabric record.
create table public.fabrics (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references public.suppliers (id) on delete cascade,
  external_id        text not null,
  name               text not null,
  composition        text,
  properties         jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
    -- { fibre, weight, drape, stretch, opacity, directional_pattern: bool }
  price_per_metre    numeric(12,2) not null check (price_per_metre >= 0),
  stock_metres       numeric(10,2) not null default 0 check (stock_metres >= 0),
  supported_options  jsonb not null default '{}'::jsonb check (jsonb_typeof(supported_options) = 'object'),
    -- { "<option_group_key>": ["<option_value_key>", ...], ... } — FR-TPL-07
  is_available       boolean not null default false,  -- false until synced with option data (FR-TPL-10)
  is_hidden          boolean not null default false,  -- admin override (FR-FAB-07), regardless of supplier availability
  display_name       text,                             -- admin override (FR-FAB-07)
  source             text not null default 'sync' check (source in ('sync', 'csv_import', 'manual')),
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (supplier_id, external_id)
);

create table public.fabric_images (
  id         uuid primary key default gen_random_uuid(),
  fabric_id  uuid not null references public.fabrics (id) on delete cascade,
  url        text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- dress_templates: platform-owned, shared across suppliers (D3). Replaces the
-- per-shop product catalogue entirely.
create table public.dress_templates (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description            text,
  base_stitch_price      numeric(12,2) not null default 0 check (base_stitch_price >= 0),
  lead_days              integer not null default 7 check (lead_days >= 0),
  required_measurements  jsonb not null default '[]'::jsonb check (jsonb_typeof(required_measurements) = 'array'),
    -- [{ "key": "chest", "label": "Chest", "unit": "cm", "min": 60, "max": 160 }, ...] — FR-TPL-05
  recommended_options    jsonb not null default '{}'::jsonb check (jsonb_typeof(recommended_options) = 'object'),
    -- { "<option_group_key>": "<option_value_key>", ... } — FR-TPL-06 / FR-CUS-05
  yardage_formula        jsonb not null default '{}'::jsonb check (jsonb_typeof(yardage_formula) = 'object'),
    -- { "base_metres": 2.5, "coefficients": { "chest": 0.015, ... }, "wastage_margin": 0.1 } — D9, SDS §6.2
  is_published           boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- option_groups / option_values: shared platform vocabulary (FR-TPL-03), so a
-- value means the same thing everywhere. Supplier adapters map vendor option
-- names onto this vocabulary (SDS v2 §9.2).
create table public.option_groups (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,   -- e.g. 'neckline', 'sleeve', 'cuff', 'bottom', 'closure'
  label      text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.option_values (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.option_groups (id) on delete cascade,
  key        text not null,          -- e.g. 'round', 'v-neck', 'hard', 'soft'
  label      text not null,
  image_url  text,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, key)
);

-- template_options: which shared values a template offers, and at what price.
create table public.template_options (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.dress_templates (id) on delete cascade,
  group_id        uuid not null references public.option_groups (id) on delete cascade,
  value_id        uuid not null references public.option_values (id) on delete cascade,
  price_delta     numeric(12,2) not null default 0,
  extra_lead_days integer not null default 0 check (extra_lead_days >= 0),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (template_id, group_id, value_id)
);

-- =============================================================================
-- Ordering and measurement (SDS v2 §4.2 "Ordering and measurement")
-- =============================================================================

-- order_drafts: the resumable journey (FR-CUS-13). Not an order until paid (D7).
create table public.order_drafts (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid references public.profiles (id) on delete cascade,
  agent_id                uuid references public.profiles (id) on delete set null,
  fabric_id               uuid references public.fabrics (id) on delete set null,
  template_id             uuid references public.dress_templates (id) on delete set null,
  options                 jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
    -- { "<option_group_key>": "<option_value_key>", ... }
  measurement_profile_id  uuid,  -- FK added below, once measurement_profiles exists
  step                    text not null default 'fabric',
  expires_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
-- (measurement_profiles is created below; the FK above is added after its table exists.)

-- measurement_profiles: kept from v1, with confirmation columns added (D8).
-- ("values" is a reserved word in SQL, so the column is measurement_values.)
create table public.measurement_profiles (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.profiles (id) on delete cascade,
  label               text not null default 'Me',
  measurement_values  jsonb not null default '{}'::jsonb check (jsonb_typeof(measurement_values) = 'object'),
  source              public.measurement_source not null default 'manual',
  confidence          jsonb check (confidence is null or jsonb_typeof(confidence) = 'object'),
  confirmed_by_id     uuid references public.profiles (id) on delete set null,  -- customer, or agent acting for them
  confirmed_by_role   public.app_role,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.order_drafts
  add constraint order_drafts_measurement_profile_fkey
  foreign key (measurement_profile_id) references public.measurement_profiles (id) on delete set null;

create sequence public.order_number_seq;

-- orders: created on payment confirmation, not on submission (D7). Carries the
-- two approval checkpoints as separate column pairs (D8, §8.3) so each is
-- independently testable per the SRS §14.2 acceptance criteria.
create table public.orders (
  id                             uuid primary key default gen_random_uuid(),
  number                         text not null unique
    default ('MF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  customer_id                    uuid not null references public.profiles (id) on delete restrict,  -- beneficiary
  placed_by_id                   uuid references public.profiles (id) on delete set null,            -- who submitted (self or agent)
  order_channel                  public.order_channel not null default 'self_serve',
  agent_id                       uuid references public.profiles (id) on delete set null,
  supplier_id                    uuid not null references public.suppliers (id) on delete restrict,
  fabric_id                      uuid not null references public.fabrics (id) on delete restrict,
  template_id                    uuid not null references public.dress_templates (id) on delete restrict,
  status                         public.order_status not null default 'placed',
  measurement_profile_id         uuid references public.measurement_profiles (id) on delete set null,
  measurements_confirmed_by_id   uuid references public.profiles (id) on delete set null,
  measurements_confirmed_by_role public.app_role,
  measurements_confirmed_at      timestamptz,
  production_approved_by_id      uuid references public.profiles (id) on delete set null,  -- tailor/QC only — the cutting gate
  production_approved_at         timestamptz,
  yardage_metres                 numeric(10,3),
  fabric_cost                    numeric(12,2) not null default 0 check (fabric_cost >= 0),
  stitch_cost                    numeric(12,2) not null default 0 check (stitch_cost >= 0),
  options_cost                   numeric(12,2) not null default 0 check (options_cost >= 0),
  total                          numeric(12,2) not null default 0 check (total >= 0),
  payment_method                 public.payment_method not null default 'online',
  payment_status                 public.order_payment_status not null default 'unpaid',
  est_delivery_date              date,
  cancelled_reason                text,
  admin_note                     text,  -- FR-ADM-06: admin can add a note on disputes
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

-- order_items: snapshot — later catalogue or profile edits do not change it.
-- One garment per order in P1 (D7 removes the cart), so qty is always 1.
create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  template_id   uuid references public.dress_templates (id) on delete set null,
  template_name text not null,
  options       jsonb not null default '[]'::jsonb,  -- [{ group, value, label, price_delta }] — resolved at order time
  measurements  jsonb,                                -- confirmed snapshot
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  qty           integer not null default 1 check (qty = 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- order_status_history: written only by fn_transition_order / fn_create_order_from_draft.
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  public.app_role,
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- fabric_reservations: rows, not a counter on fabrics.stock_metres, because a
-- decrement cannot express expiry and cannot be audited (SDS v2 §4.3, §6.3).
create table public.fabric_reservations (
  id             uuid primary key default gen_random_uuid(),
  fabric_id      uuid not null references public.fabrics (id) on delete cascade,
  order_draft_id uuid references public.order_drafts (id) on delete cascade,
  order_id       uuid references public.orders (id) on delete cascade,
  metres         numeric(10,3) not null check (metres > 0),
  kind           public.reservation_kind not null,
  status         public.reservation_status not null default 'active',
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (order_draft_id is not null or order_id is not null)
);

-- order_consents: agent acting on behalf, camera use, WhatsApp opt-in (FR-AGT-07, NFR-PRIV-03).
create table public.order_consents (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  agent_id    uuid references public.profiles (id) on delete set null,
  consent_type public.consent_type not null,
  granted_at  timestamptz not null default now(),
  evidence    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- Agents, production and fulfilment (SDS v2 §4.2, §10)
-- =============================================================================

-- agents: platform level, no supplier reference — scoped by assignment, not tenancy.
create table public.agents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  code       text not null unique,
  region     text,
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- agent_customers: the assignment that scopes an agent's reads (D11, §10.1).
create table public.agent_customers (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agent_id, customer_id)
);

-- production_jobs: created when an order reaches Placed. Its own stage enum
-- runs in parallel with the order's status (SDS v2 §10.4) — internal rework
-- should not churn the customer's status timeline.
create table public.production_jobs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders (id) on delete cascade,
  assigned_to_id uuid references public.profiles (id) on delete set null,
  stage         public.production_stage not null default 'pending',
  started_at    timestamptz,
  finished_at   timestamptz,
  priority      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- production_events: the production equivalent of order_status_history.
create table public.production_events (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.production_jobs (id) on delete cascade,
  from_stage public.production_stage,
  to_stage   public.production_stage not null,
  actor_id   uuid references public.profiles (id) on delete set null,
  reason     text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- production_remakes: makes material loss visible (FR-PRD-07).
create table public.production_remakes (
  id                  uuid primary key default gen_random_uuid(),
  original_job_id     uuid not null references public.production_jobs (id) on delete cascade,
  replacement_job_id  uuid references public.production_jobs (id) on delete set null,
  reason              text not null,
  fabric_metres_lost  numeric(10,3) not null default 0 check (fabric_metres_lost >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.shipments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders (id) on delete cascade,
  courier       text,
  tracking_ref  text,
  dispatched_at timestamptz,
  delivered_at  timestamptz,
  status        public.shipment_status not null default 'pending',
  attempts      integer not null default 0,
  last_failure_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- integration_outbox: the second outbox (D6). A supply push is written in the
-- same transaction as the order; integration-dispatch drains it with back-off.
create table public.integration_outbox (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers (id) on delete cascade,
  order_id        uuid references public.orders (id) on delete set null,
  kind            text not null default 'order_push',  -- 'order_push', 'order_cancel'
  payload         jsonb not null default '{}'::jsonb,
  status          public.outbox_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- Carried forward from v1.0 (SDS v2 §4.1)
-- =============================================================================

-- payments: a refund is a row with kind = 'refund' against the same order
-- (FR-PAY-05), rather than a separate table. event_id makes webhooks idempotent.
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  kind        public.payment_kind not null default 'charge',
  method      public.payment_method not null,
  amount      numeric(12,2) not null check (amount >= 0),
  status      public.payment_status not null default 'pending',
  gateway_ref text,
  event_id    text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.notification_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  channel    public.notification_channel not null,
  subject    text,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, channel)
);

-- notification_outbox: written in the same transaction as the state change (D6).
create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references public.orders (id) on delete set null,
  channel         public.notification_channel not null,
  recipient       text not null,
  template        text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          public.outbox_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- scan_deletion_log: proof of the 24-hour scan deletion policy (FR-AI-09).
create table public.scan_deletion_log (
  id            uuid primary key default gen_random_uuid(),
  run_at        timestamptz not null default now(),
  files_deleted integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- audit_log: admin and agent sensitive actions (FR-ADM-10, FR-AGT-10).
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reviews (P2): one per delivered order. No supplier/shop reference — the
-- customer reviews the garment and MultiFe's service, not a shop.
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  is_hidden   boolean not null default false,  -- set by admin only
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 4. Indexes (SDS v2 §13.4) + foreign-key indexes
-- -----------------------------------------------------------------------------
create index orders_status_created_idx          on public.orders (status, created_at desc);
create index orders_agent_created_idx           on public.orders (agent_id, created_at desc);
create index orders_customer_created_idx        on public.orders (customer_id, created_at desc);
create index orders_supplier_idx                on public.orders (supplier_id);
create index production_jobs_stage_assigned_idx on public.production_jobs (stage, assigned_to_id);
create index fabrics_supplier_available_idx     on public.fabrics (supplier_id, is_available);
create index fabric_reservations_fabric_status_idx on public.fabric_reservations (fabric_id, status);
create index fabric_reservations_draft_idx       on public.fabric_reservations (order_draft_id);
create index fabric_reservations_order_idx       on public.fabric_reservations (order_id);
create index order_status_history_order_idx      on public.order_status_history (order_id, created_at);
create index order_items_order_idx               on public.order_items (order_id);
create index payments_order_idx                  on public.payments (order_id);
create index fabric_images_fabric_idx            on public.fabric_images (fabric_id, sort);
create index template_options_template_idx       on public.template_options (template_id);
create index option_values_group_idx             on public.option_values (group_id);
create index supplier_contacts_user_idx          on public.supplier_contacts (user_id);
create index measurement_profiles_customer_idx    on public.measurement_profiles (customer_id);
create index order_drafts_customer_idx            on public.order_drafts (customer_id);
create index order_drafts_agent_idx               on public.order_drafts (agent_id);
create index agent_customers_agent_idx            on public.agent_customers (agent_id);
create index agent_customers_customer_idx         on public.agent_customers (customer_id);
create index production_events_job_idx            on public.production_events (job_id, created_at);
create index integration_outbox_pending_idx       on public.integration_outbox (next_attempt_at) where status = 'pending';
create index integration_sync_runs_supplier_idx   on public.integration_sync_runs (supplier_id, started_at desc);
create index audit_log_entity_idx                 on public.audit_log (entity, entity_id);
create index audit_log_created_idx                on public.audit_log (created_at desc);
create index notification_outbox_pending_idx      on public.notification_outbox (next_attempt_at) where status = 'pending';


-- -----------------------------------------------------------------------------
-- 5. updated_at triggers on every table
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'suppliers', 'supplier_contacts', 'supplier_integrations', 'integration_sync_runs',
    'fabrics', 'fabric_images', 'dress_templates', 'option_groups', 'option_values', 'template_options',
    'order_drafts', 'measurement_profiles', 'orders', 'order_items', 'order_status_history',
    'fabric_reservations', 'order_consents', 'agents', 'agent_customers',
    'production_jobs', 'production_events', 'production_remakes', 'shipments', 'integration_outbox',
    'payments', 'notification_templates', 'notification_outbox', 'scan_deletion_log', 'audit_log', 'reviews'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Role / scope helpers used by RLS (SECURITY DEFINER so they don't recurse
--    into RLS). D11: role-scoped, not tenant-scoped — there is no shop_id.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.current_agent_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select a.id from public.agents a
  join public.profiles p on p.id = a.profile_id
  where a.profile_id = (select auth.uid()) and a.status = 'active' and p.status = 'active';
$$;

create or replace function public.is_agent()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_agent_id() is not null;
$$;

-- FR-AGT-06 / NFR-SEC-02: an agent may read only their assigned customers.
create or replace function public.is_assigned_agent_for(p_customer_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.agent_customers ac
    where ac.agent_id = public.current_agent_id() and ac.customer_id = p_customer_id
  );
$$;

create or replace function public.is_production_role()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('tailor', 'qc', 'dispatch') and status = 'active'
  );
$$;

create or replace function public.is_tailor_or_qc()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('tailor', 'qc') and status = 'active'
  );
$$;

create or replace function public.is_dispatch()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'dispatch' and status = 'active'
  );
$$;

-- FR-AUTH-06: a tailor/QC/dispatch user sees only the jobs assigned to them.
create or replace function public.is_assigned_job_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.production_jobs j
    where j.order_id = p_order_id and j.assigned_to_id = (select auth.uid())
  );
$$;

create or replace function public.current_supplier_contact_supplier_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select sc.supplier_id from public.supplier_contacts sc
  join public.profiles p on p.id = sc.user_id
  where sc.user_id = (select auth.uid()) and p.status = 'active'
  limit 1;
$$;

-- FR-AUTH-07, NFR-SEC-03: the strictest policy in the system — a supplier
-- contact must never see customer identity, measurements or order value.
create or replace function public.is_supplier_contact_for(p_supplier_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_supplier_contact_supplier_id() = p_supplier_id;
$$;


-- -----------------------------------------------------------------------------
-- 7. Column guards
-- -----------------------------------------------------------------------------

-- Columns listed in the trigger arguments can only be changed by an admin
-- (or by server code using the service-role key, where auth.uid() is null).
create or replace function public.guard_admin_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;
  foreach col in array tg_argv loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception 'Only an admin can change %.%', tg_table_name, col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger guard_admin_columns before update on public.profiles
  for each row execute function public.guard_admin_columns('role', 'status', 'is_provisional');
create trigger guard_admin_columns before update on public.reviews
  for each row execute function public.guard_admin_columns('is_hidden');

-- D1 (orders §7.1): order status changes only through fn_transition_order.
create or replace function public.guard_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('multife.status_transition', true), '') <> 'on' then
    raise exception 'Order status can only change through fn_transition_order'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_order_status before update on public.orders
  for each row execute function public.guard_order_status();

-- SDS v2 §7.3: the cutting gate is enforced redundantly in three places, and
-- this is the one that counts. No role — not even admin — may set these
-- columns except through fn_confirm_measurements / fn_approve_for_production.
create or replace function public.guard_order_approval_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('multife.approval_write', true), '') = 'on' then
    return new;
  end if;
  if new.measurements_confirmed_by_id   is distinct from old.measurements_confirmed_by_id
     or new.measurements_confirmed_by_role is distinct from old.measurements_confirmed_by_role
     or new.measurements_confirmed_at   is distinct from old.measurements_confirmed_at
     or new.production_approved_by_id   is distinct from old.production_approved_by_id
     or new.production_approved_at      is distinct from old.production_approved_at then
    raise exception 'Measurement approval columns can only be set by fn_confirm_measurements or fn_approve_for_production'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_order_approval_columns before update on public.orders
  for each row execute function public.guard_order_approval_columns();


-- -----------------------------------------------------------------------------
-- 8. Auth integration
-- -----------------------------------------------------------------------------

-- Create a profile for each new auth user. Role defaults to customer. Every
-- role other than customer joins by invite only: the server sets
-- app_metadata (role, plus the role's own linking fields) with the
-- service-role key. user_metadata is never trusted for roles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role        public.app_role;
  v_supplier    uuid;
  v_provisional boolean;
  v_created_by  uuid;
begin
  v_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'customer')::public.app_role;
  v_provisional := coalesce((new.raw_app_meta_data ->> 'provisional')::boolean, false);
  v_created_by  := nullif(new.raw_app_meta_data ->> 'provisional_created_by_id', '')::uuid;

  insert into public.profiles (id, role, full_name, phone, email, is_provisional, provisional_created_by_id)
  values (new.id, v_role, new.raw_user_meta_data ->> 'full_name', new.phone, new.email,
          v_provisional, v_created_by);

  if v_role = 'agent' then
    insert into public.agents (profile_id, code, region)
    values (
      new.id,
      coalesce(new.raw_app_meta_data ->> 'agent_code', 'AG-' || substr(new.id::text, 1, 8)),
      new.raw_app_meta_data ->> 'region'
    );
  end if;

  v_supplier := nullif(new.raw_app_meta_data ->> 'supplier_id', '')::uuid;
  if v_role = 'supplier_contact' and v_supplier is not null then
    insert into public.supplier_contacts (supplier_id, user_id)
    values (v_supplier, new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email/phone in sync with auth.users.
create or replace function public.handle_user_contact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email, phone = new.phone
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_contact_changed
  after update of email, phone on auth.users
  for each row execute function public.handle_user_contact_change();

-- FR-AUTH-10: when a provisional customer verifies their phone (OTP sign-in
-- confirms the pre-existing, unconfirmed auth user), clear is_provisional and
-- record the claim. Merge-into-an-existing-account is an app-level case
-- (server action), not handled here — see STATUS.md DB gaps.
create or replace function public.handle_phone_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.phone_confirmed_at is null and new.phone_confirmed_at is not null then
    update public.profiles set is_provisional = false
     where id = new.id and is_provisional;
    if found then
      insert into public.audit_log (actor_id, action, entity, entity_id, after)
      values (new.id, 'profile.claim', 'profiles', new.id, jsonb_build_object('claimed_at', new.phone_confirmed_at));
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_phone_confirmed
  after update of phone_confirmed_at on auth.users
  for each row execute function public.handle_phone_confirmed();

-- SDS v2 §12.1: custom access token hook — adds app_role, account_status and,
-- depending on role, agent_id or supplier_id claims. There is no shop_id;
-- policies must not assume one exists (D11).
-- Enable it in Dashboard → Authentication → Hooks → Custom Access Token.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user     uuid := (event ->> 'user_id')::uuid;
  v_claims   jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_role     public.app_role;
  v_status   public.account_status;
  v_agent    uuid;
  v_supplier uuid;
begin
  select role, status into v_role, v_status
  from public.profiles where id = v_user;

  if v_role = 'agent' then
    select id into v_agent from public.agents where profile_id = v_user;
  elsif v_role = 'supplier_contact' then
    select supplier_id into v_supplier from public.supplier_contacts where user_id = v_user limit 1;
  end if;

  v_claims := v_claims
    || jsonb_build_object(
         'app_role',       coalesce(v_role::text, 'customer'),
         'account_status', coalesce(v_status::text, 'active'),
         'agent_id',       v_agent,
         'supplier_id',    v_supplier
       );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant select on public.profiles, public.agents, public.supplier_contacts to supabase_auth_admin;


-- -----------------------------------------------------------------------------
-- 9. Notifications (D6 outbox)
-- -----------------------------------------------------------------------------
create or replace function public.fn_enqueue_notification(
  p_order_id  uuid,
  p_channel   public.notification_channel,
  p_recipient text,
  p_template  text,
  p_payload   jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or btrim(p_recipient) = '' then
    return;
  end if;
  insert into public.notification_outbox (order_id, channel, recipient, template, payload)
  values (p_order_id, p_channel, p_recipient, p_template, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Enqueue the customer-facing message for one order event.
create or replace function public.fn_notify_order(
  p_order_id       uuid,
  p_template       text,
  p_whatsapp       boolean default false,
  p_reason         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_customer public.profiles;
  v_payload  jsonb;
begin
  if p_template is null then
    return;
  end if;

  select * into v_order    from public.orders   where id = p_order_id;
  select * into v_customer from public.profiles where id = v_order.customer_id;

  v_payload := jsonb_build_object(
    'order_id',         v_order.id,
    'order_number',     v_order.number,
    'status',           v_order.status,
    'total',            v_order.total,
    'est_delivery_date', v_order.est_delivery_date,
    'customer_name',    v_customer.full_name,
    'reason',           p_reason
  );

  perform public.fn_enqueue_notification(v_order.id, 'email', v_customer.email, p_template, v_payload);
  if p_whatsapp and v_customer.whatsapp_opt_in then
    perform public.fn_enqueue_notification(v_order.id, 'whatsapp', v_customer.phone, p_template, v_payload);
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. Fabric reservations (SDS v2 §6.3, §6.4)
-- -----------------------------------------------------------------------------

-- Soft reservation on entering the measurement step (FR-FAB-08). Stock
-- available = fabrics.stock_metres − sum of active soft/hard reservations.
create or replace function public.fn_take_soft_reservation(
  p_draft_id uuid,
  p_fabric_id uuid,
  p_metres numeric,
  p_expires_in interval default '20 minutes'
)
returns public.fabric_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fabric    public.fabrics;
  v_reserved  numeric;
  v_res       public.fabric_reservations;
begin
  select * into v_fabric from public.fabrics where id = p_fabric_id for update;
  if not found or not v_fabric.is_available then
    raise exception 'Fabric is not available' using errcode = '22023';
  end if;

  select coalesce(sum(metres), 0) into v_reserved
  from public.fabric_reservations
  where fabric_id = p_fabric_id and status = 'active';

  if v_fabric.stock_metres - v_reserved < p_metres then
    raise exception 'Not enough fabric in stock' using errcode = '22023';
  end if;

  delete from public.fabric_reservations
   where order_draft_id = p_draft_id and kind = 'soft' and status = 'active';

  insert into public.fabric_reservations (fabric_id, order_draft_id, metres, kind, status, expires_at)
  values (p_fabric_id, p_draft_id, p_metres, 'soft', 'active', now() + p_expires_in)
  returning * into v_res;

  return v_res;
end;
$$;

-- Hard reservation at checkout (FR-FAB-09, SDS v2 §6.4). Must run, and fail,
-- before any payment is attempted — the caller initiates the gateway checkout
-- only once this returns successfully.
create or replace function public.fn_take_hard_reservation(
  p_draft_id uuid,
  p_fabric_id uuid,
  p_metres numeric
)
returns public.fabric_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fabric   public.fabrics;
  v_reserved numeric;
  v_res      public.fabric_reservations;
begin
  select * into v_fabric from public.fabrics where id = p_fabric_id for update;
  if not found or not v_fabric.is_available then
    raise exception 'Fabric is not available' using errcode = '22023';
  end if;

  select coalesce(sum(metres), 0) into v_reserved
  from public.fabric_reservations
  where fabric_id = p_fabric_id and status = 'active'
    and not (kind = 'soft' and order_draft_id = p_draft_id);  -- this draft's own soft hold doesn't double-count

  if v_fabric.stock_metres - v_reserved < p_metres then
    raise exception 'Not enough fabric in stock to confirm this order' using errcode = '22023';
  end if;

  update public.fabric_reservations set status = 'converted'
   where order_draft_id = p_draft_id and kind = 'soft' and status = 'active';

  insert into public.fabric_reservations (fabric_id, order_draft_id, metres, kind, status)
  values (p_fabric_id, p_draft_id, p_metres, 'hard', 'active')
  returning * into v_res;

  return v_res;
end;
$$;

-- reservation-expiry background job (SDS v2 §11.3). Service role only.
create or replace function public.fn_release_expired_soft_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.fabric_reservations
     set status = 'expired'
   where kind = 'soft' and status = 'active' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- -----------------------------------------------------------------------------
-- 11. Order lifecycle (SDS v2 §7) — the only way an order's status changes
-- -----------------------------------------------------------------------------

-- Customer confirmation checkpoint (D8, first gate): customer or the agent
-- acting for them confirms the measurement set before payment (FR-AI-12).
create or replace function public.fn_confirm_measurements(
  p_profile_id uuid,
  p_values     jsonb,
  p_actor_role public.app_role
)
returns public.measurement_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile public.measurement_profiles;
  v_is_self boolean;
  v_is_agent boolean;
begin
  select * into v_profile from public.measurement_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Measurement profile not found' using errcode = 'P0002';
  end if;

  v_is_self  := v_uid is not null and v_profile.customer_id = v_uid;
  v_is_agent := public.is_assigned_agent_for(v_profile.customer_id);

  if not (v_is_self or v_is_agent) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_actor_role not in ('customer', 'agent') then
    raise exception 'Only the customer or their agent may confirm measurements' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;

  update public.measurement_profiles
     set measurement_values = p_values,
         confirmed_by_id    = v_uid,
         confirmed_by_role  = p_actor_role,
         confirmed_at       = now()
   where id = p_profile_id
  returning * into v_profile;

  return v_profile;
end;
$$;

-- Order creation on confirmed payment (D7). Service-role only — called from
-- the payment webhook route handler after the gateway signature is verified.
-- Idempotent on p_event_id (a replayed webhook returns the existing order).
create or replace function public.fn_create_order_from_draft(
  p_draft_id    uuid,
  p_amount      numeric,
  p_gateway_ref text,
  p_event_id    text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft    public.order_drafts;
  v_fabric   public.fabrics;
  v_template public.dress_templates;
  v_profile  public.measurement_profiles;
  v_res      public.fabric_reservations;
  v_existing uuid;
  v_order    public.orders;
begin
  select order_id into v_existing from public.payments where event_id = p_event_id;
  if v_existing is not null then
    select * into v_order from public.orders where id = v_existing;
    return v_order;
  end if;

  select * into v_draft from public.order_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;

  select * into v_fabric   from public.fabrics        where id = v_draft.fabric_id;
  select * into v_template from public.dress_templates where id = v_draft.template_id;
  select * into v_profile  from public.measurement_profiles where id = v_draft.measurement_profile_id;

  if v_profile.confirmed_at is null then
    raise exception 'Measurements are not confirmed' using errcode = '22023';
  end if;

  select * into v_res from public.fabric_reservations
   where order_draft_id = p_draft_id and kind = 'hard' and status = 'active'
   for update;
  if not found then
    raise exception 'No hard fabric reservation held for this draft' using errcode = '22023';
  end if;

  insert into public.orders (
    customer_id, placed_by_id, order_channel, agent_id, supplier_id, fabric_id, template_id,
    measurement_profile_id, measurements_confirmed_by_id, measurements_confirmed_by_role,
    measurements_confirmed_at, yardage_metres, total, payment_status, est_delivery_date
  )
  values (
    v_draft.customer_id,
    coalesce(v_draft.agent_id, v_draft.customer_id),
    case when v_draft.agent_id is not null then 'agent_placed' else 'self_serve' end,
    v_draft.agent_id, v_fabric.supplier_id, v_fabric.id, v_template.id,
    v_profile.id, v_profile.confirmed_by_id, v_profile.confirmed_by_role,
    v_profile.confirmed_at, v_res.metres, p_amount, 'paid',
    current_date + v_template.lead_days
  )
  returning * into v_order;

  insert into public.order_items (order_id, template_id, template_name, options, measurements, unit_price)
  values (v_order.id, v_template.id, v_template.name, v_draft.options, v_profile.measurement_values, p_amount);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role)
  values (v_order.id, null, 'placed', null, 'customer');

  insert into public.payments (order_id, kind, method, amount, status, gateway_ref, event_id)
  values (v_order.id, 'charge', 'online', p_amount, 'paid', p_gateway_ref, p_event_id);

  update public.fabric_reservations set order_id = v_order.id where id = v_res.id;

  insert into public.production_jobs (order_id) values (v_order.id);

  perform public.fn_notify_order(v_order.id, 'order_placed');

  return v_order;
end;
$$;

-- The core transition function (D1, §7.1). Every order state change, whoever
-- initiates it, runs through here: checks role and allowed move, updates the
-- order, writes history, and enqueues side effects, all in one transaction.
create or replace function public.fn_transition_order(
  p_order_id   uuid,
  p_to_status  public.order_status,
  p_actor_role public.app_role,
  p_reason     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_order       public.orders;
  v_from        public.order_status;
  v_is_service  boolean := v_uid is null and coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_admin    boolean := public.is_admin();
  v_is_customer boolean;
  v_is_agent    boolean;
  v_profile_role public.app_role;
  v_reason      text := nullif(btrim(p_reason), '');
  v_shipment    public.shipments;
  v_pay_status  public.order_payment_status;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_from := v_order.status;

  if v_uid is not null then
    select role into v_profile_role from public.profiles where id = v_uid;
    if v_profile_role is distinct from p_actor_role and not v_is_admin then
      raise exception 'Actor role does not match the caller' using errcode = '42501';
    end if;
  elsif not v_is_service then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_is_customer := v_uid is not null and v_order.customer_id = v_uid;
  v_is_agent    := v_uid is not null and v_order.agent_id = v_uid and public.is_agent();

  if v_from in ('delivered', 'cancelled', 'failed') then
    raise exception 'Order % is already %', v_order.number, v_from using errcode = '22023';
  end if;

  if p_to_status = 'cancelled' then
    if v_is_admin then
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;
    elsif (v_is_customer or v_is_agent)
          and v_from in ('placed', 'fabric_secured', 'received_at_hub', 'measurements_approved') then
      null;  -- FR-CUS-16: cancellation closes once cutting starts
    else
      raise exception 'This order can no longer be cancelled' using errcode = '42501';
    end if;

  elsif p_to_status = 'failed' then
    if not v_is_admin then
      raise exception 'Only an admin can fail an order' using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'A reason is required' using errcode = '22023';
    end if;

  else
    if v_from = 'placed' and p_to_status = 'fabric_secured' then
      if not (v_is_admin or v_is_service) then
        raise exception 'Only the system or an admin can confirm fabric is secured' using errcode = '42501';
      end if;

    elsif v_from = 'fabric_secured' and p_to_status = 'received_at_hub' then
      if not (p_actor_role in ('tailor', 'qc') or v_is_admin) then
        raise exception 'Only warehouse staff can record receipt' using errcode = '42501';
      end if;

    elsif v_from = 'received_at_hub' and p_to_status = 'measurements_approved' then
      if not public.is_tailor_or_qc() then
        raise exception 'Only a tailor or QC can approve measurements' using errcode = '42501';
      end if;
      if v_order.production_approved_at is null then
        raise exception 'Record production approval first (fn_approve_for_production)' using errcode = '22023';
      end if;

    elsif v_from = 'measurements_approved' and p_to_status = 'in_cutting' then
      -- SDS v2 §7.3: the cutting gate — the one guard enforced redundantly and
      -- the one check that counts. No role, whatever it claims, bypasses this.
      if v_order.production_approved_at is null then
        raise exception 'Cutting is refused: no recorded production approval' using errcode = '22023';
      end if;
      if not public.is_tailor_or_qc() then
        raise exception 'Only a tailor or QC can start cutting' using errcode = '42501';
      end if;

    elsif v_from = 'in_cutting' and p_to_status = 'in_stitching' then
      if not public.is_tailor_or_qc() then
        raise exception 'Not allowed' using errcode = '42501';
      end if;

    elsif v_from = 'in_stitching' and p_to_status = 'in_qc' then
      if not public.is_tailor_or_qc() then
        raise exception 'Not allowed' using errcode = '42501';
      end if;

    elsif v_from = 'in_qc' and p_to_status = 'ready_to_ship' then
      if p_actor_role <> 'qc' and not v_is_admin then
        raise exception 'Only QC can pass a job' using errcode = '42501';
      end if;

    elsif v_from = 'in_qc' and p_to_status = 'in_stitching' then
      if p_actor_role <> 'qc' and not v_is_admin then
        raise exception 'Only QC can fail a job' using errcode = '42501';
      end if;
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;

    elsif v_from = 'ready_to_ship' and p_to_status = 'dispatched' then
      if p_actor_role <> 'dispatch' and not v_is_admin then
        raise exception 'Only dispatch can mark an order dispatched' using errcode = '42501';
      end if;
      select * into v_shipment from public.shipments where order_id = v_order.id;
      if not found or v_shipment.courier is null or v_shipment.tracking_ref is null then
        raise exception 'Record the courier and tracking reference first' using errcode = '22023';
      end if;

    elsif v_from = 'dispatched' and p_to_status = 'delivered' then
      if not (p_actor_role = 'dispatch' or v_is_admin or v_is_service) then
        raise exception 'Not allowed' using errcode = '42501';
      end if;

    else
      raise exception 'Cannot move an order from % to %', v_from, p_to_status using errcode = '22023';
    end if;
  end if;

  -- FR-ORD-10: a cancelled or failed order with a captured payment is refunded.
  v_pay_status := v_order.payment_status;
  if p_to_status in ('cancelled', 'failed') and v_order.payment_status = 'paid' then
    v_pay_status := 'refund_pending';
    insert into public.payments (order_id, kind, method, amount, status)
    values (v_order.id, 'refund', v_order.payment_method, v_order.total, 'pending');
  end if;

  perform set_config('multife.status_transition', 'on', true);
  update public.orders
     set status = p_to_status, payment_status = v_pay_status,
         cancelled_reason = case when p_to_status in ('cancelled', 'failed') then v_reason else cancelled_reason end
   where id = p_order_id
  returning * into v_order;
  perform set_config('multife.status_transition', 'off', true);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_role, reason)
  values (v_order.id, v_from, p_to_status, v_uid, p_actor_role, v_reason);

  if p_to_status = 'cancelled' then
    update public.fabric_reservations set status = 'released'
     where order_id = v_order.id and status = 'active';
    perform public.fn_notify_order(v_order.id, 'order_cancelled', false, v_reason);
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (v_uid, 'order.cancel', 'orders', v_order.id,
            jsonb_build_object('status', v_from), jsonb_build_object('status', 'cancelled', 'reason', v_reason));
  elsif p_to_status = 'failed' then
    update public.fabric_reservations set status = 'released'
     where order_id = v_order.id and status = 'active';
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (v_uid, 'order.fail', 'orders', v_order.id,
            jsonb_build_object('status', v_from), jsonb_build_object('status', 'failed', 'reason', v_reason));
  elsif p_to_status = 'in_cutting' then
    update public.fabrics set stock_metres = stock_metres - v_order.yardage_metres where id = v_order.fabric_id;
  elsif p_to_status = 'dispatched' then
    perform public.fn_notify_order(v_order.id, 'order_dispatched', true);
  elsif p_to_status = 'delivered' then
    perform public.fn_notify_order(v_order.id, 'order_delivered', true);
  end if;

  return v_order;
end;
$$;

-- Production approval checkpoint (D8, second gate, the cutting gate itself):
-- a tailor or QC validates confirmed measurements against the template's
-- required fields, records corrections where needed, then moves the order
-- into measurements_approved.
create or replace function public.fn_approve_for_production(
  p_job_id  uuid,
  p_values  jsonb,
  p_reason  text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job      public.production_jobs;
  v_order    public.orders;
  v_template public.dress_templates;
  v_field    jsonb;
  v_key      text;
  v_label    text;
  v_num      numeric;
  v_errors   text[] := '{}';
begin
  if not public.is_tailor_or_qc() then
    raise exception 'Only a tailor or QC can approve measurements for production' using errcode = '42501';
  end if;

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = v_job.order_id for update;
  select * into v_template from public.dress_templates where id = v_order.template_id;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;

  for v_field in select * from jsonb_array_elements(v_template.required_measurements)
  loop
    v_key   := v_field ->> 'key';
    v_label := coalesce(v_field ->> 'label', v_key);

    if jsonb_typeof(p_values -> v_key) is distinct from 'number' then
      v_errors := v_errors || format('%s is missing', v_label);
      continue;
    end if;

    v_num := (p_values ->> v_key)::numeric;
    if ((v_field ->> 'min') is not null and v_num < (v_field ->> 'min')::numeric)
       or ((v_field ->> 'max') is not null and v_num > (v_field ->> 'max')::numeric) then
      v_errors := v_errors || format('%s must be between %s and %s',
                                     v_label, v_field ->> 'min', v_field ->> 'max');
    end if;
  end loop;

  if cardinality(v_errors) > 0 then
    raise exception 'Invalid measurements: %', array_to_string(v_errors, '; ') using errcode = '22023';
  end if;

  update public.order_items set measurements = p_values where order_id = v_order.id;

  perform set_config('multife.approval_write', 'on', true);
  update public.orders
     set production_approved_by_id = (select auth.uid()),
         production_approved_at    = now()
   where id = v_order.id;
  perform set_config('multife.approval_write', 'off', true);

  update public.production_jobs set stage = 'approved' where id = v_job.id;
  insert into public.production_events (job_id, from_stage, to_stage, actor_id, reason)
  values (v_job.id, v_job.stage, 'approved', (select auth.uid()), nullif(btrim(p_reason), ''));

  return public.fn_transition_order(v_order.id, 'measurements_approved', 'tailor', p_reason);
end;
$$;

-- advanceStage (SDS v2 §11.1): moves a production job and keeps the order's
-- own lifecycle in step where a stage change corresponds to an order status.
create or replace function public.fn_advance_production_stage(
  p_job_id  uuid,
  p_to_stage public.production_stage,
  p_reason  text default null
)
returns public.production_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job   public.production_jobs;
  v_order public.orders;
  v_role  public.app_role;
begin
  if not public.is_production_role() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = (select auth.uid());

  select * into v_job from public.production_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_job.order_id;

  case p_to_stage
    when 'cutting'   then perform public.fn_transition_order(v_order.id, 'in_cutting', v_role, p_reason);
    when 'stitching' then
      if v_job.stage = 'cutting' then
        perform public.fn_transition_order(v_order.id, 'in_stitching', v_role, p_reason);
      else
        perform public.fn_transition_order(v_order.id, 'in_qc', 'qc', p_reason);  -- qc fail, back to stitching
      end if;
    when 'qc'        then perform public.fn_transition_order(v_order.id, 'in_qc', v_role, p_reason);
    when 'passed'    then perform public.fn_transition_order(v_order.id, 'ready_to_ship', 'qc', p_reason);
    when 'failed'    then null;  -- recorded via production_remakes by the caller, no order-status change here
    else null;
  end case;

  update public.production_jobs
     set stage = p_to_stage,
         started_at  = case when p_to_stage = 'cutting' and started_at is null then now() else started_at end,
         finished_at = case when p_to_stage in ('passed', 'failed') then now() else finished_at end
   where id = p_job_id
  returning * into v_job;

  insert into public.production_events (job_id, from_stage, to_stage, actor_id, reason)
  values (p_job_id, v_job.stage, p_to_stage, (select auth.uid()), nullif(btrim(p_reason), ''));

  return v_job;
end;
$$;

-- dispatchOrder (SDS v2 §11.1): records the shipment, then transitions.
create or replace function public.fn_dispatch_order(
  p_order_id uuid,
  p_courier  text,
  p_tracking_ref text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_dispatch() and not public.is_admin() then
    raise exception 'Only dispatch can dispatch an order' using errcode = '42501';
  end if;

  insert into public.shipments (order_id, courier, tracking_ref, status, dispatched_at)
  values (p_order_id, p_courier, p_tracking_ref, 'dispatched', now())
  on conflict (order_id) do update
    set courier = excluded.courier, tracking_ref = excluded.tracking_ref,
        status = 'dispatched', dispatched_at = now();

  return public.fn_transition_order(p_order_id, 'dispatched', 'dispatch');
end;
$$;

-- Payment webhook (service-role only). Refunds are reconciled the same way:
-- a matching payments row (kind = 'refund') moves from pending to paid/failed.
create or replace function public.fn_record_refund_result(
  p_order_id    uuid,
  p_gateway_ref text,
  p_event_id    text,
  p_status      public.payment_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
     set status = p_status, gateway_ref = p_gateway_ref, event_id = p_event_id
   where order_id = p_order_id and kind = 'refund' and status = 'pending'
     and event_id is null;
  if not found then
    return false;
  end if;

  if p_status = 'paid' then
    update public.orders set payment_status = 'refunded' where id = p_order_id;
  end if;
  return true;
end;
$$;


-- -----------------------------------------------------------------------------
-- 12. Function permissions
--     (Supabase grants EXECUTE on new public functions to anon/authenticated
--      by default, so lock down the ones that must not be called from the API.)
-- -----------------------------------------------------------------------------
revoke execute on function public.fn_enqueue_notification(uuid, public.notification_channel, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.fn_notify_order(uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.handle_user_contact_change() from public, anon, authenticated;
revoke execute on function public.handle_phone_confirmed()     from public, anon, authenticated;

revoke execute on function public.fn_create_order_from_draft(uuid, numeric, text, text) from public, anon, authenticated;
grant  execute on function public.fn_create_order_from_draft(uuid, numeric, text, text) to service_role;
revoke execute on function public.fn_record_refund_result(uuid, text, text, public.payment_status) from public, anon, authenticated;
grant  execute on function public.fn_record_refund_result(uuid, text, text, public.payment_status) to service_role;
revoke execute on function public.fn_release_expired_soft_reservations() from public, anon, authenticated;
grant  execute on function public.fn_release_expired_soft_reservations() to service_role;

revoke execute on function public.fn_take_soft_reservation(uuid, uuid, numeric, interval) from public, anon;
revoke execute on function public.fn_take_hard_reservation(uuid, uuid, numeric)           from public, anon;
revoke execute on function public.fn_confirm_measurements(uuid, jsonb, public.app_role)    from public, anon;
revoke execute on function public.fn_transition_order(uuid, public.order_status, public.app_role, text) from public, anon;
revoke execute on function public.fn_approve_for_production(uuid, jsonb, text)             from public, anon;
revoke execute on function public.fn_advance_production_stage(uuid, public.production_stage, text) from public, anon;
revoke execute on function public.fn_dispatch_order(uuid, text, text)                      from public, anon;

grant execute on function public.fn_take_soft_reservation(uuid, uuid, numeric, interval) to authenticated;
grant execute on function public.fn_take_hard_reservation(uuid, uuid, numeric)           to authenticated;
grant execute on function public.fn_confirm_measurements(uuid, jsonb, public.app_role)    to authenticated;
grant execute on function public.fn_transition_order(uuid, public.order_status, public.app_role, text) to authenticated;
grant execute on function public.fn_approve_for_production(uuid, jsonb, text)             to authenticated;
grant execute on function public.fn_advance_production_stage(uuid, public.production_stage, text) to authenticated;
grant execute on function public.fn_dispatch_order(uuid, text, text)                      to authenticated;


-- -----------------------------------------------------------------------------
-- 13. Row-Level Security (SDS v2 §12.2)
-- -----------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.suppliers              enable row level security;
alter table public.supplier_contacts      enable row level security;
alter table public.supplier_integrations  enable row level security;
alter table public.integration_sync_runs  enable row level security;
alter table public.fabrics                enable row level security;
alter table public.fabric_images          enable row level security;
alter table public.dress_templates        enable row level security;
alter table public.option_groups          enable row level security;
alter table public.option_values          enable row level security;
alter table public.template_options       enable row level security;
alter table public.order_drafts           enable row level security;
alter table public.measurement_profiles   enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.order_status_history   enable row level security;
alter table public.fabric_reservations    enable row level security;
alter table public.order_consents         enable row level security;
alter table public.agents                 enable row level security;
alter table public.agent_customers        enable row level security;
alter table public.production_jobs        enable row level security;
alter table public.production_events      enable row level security;
alter table public.production_remakes     enable row level security;
alter table public.shipments              enable row level security;
alter table public.integration_outbox     enable row level security;
alter table public.payments               enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_outbox    enable row level security;
alter table public.scan_deletion_log      enable row level security;
alter table public.audit_log              enable row level security;
alter table public.reviews                enable row level security;

-- ---- profiles ----
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: agent reads assigned customers" on public.profiles
  for select to authenticated using (public.is_assigned_agent_for(id));
create policy "profiles: production reads on assigned jobs" on public.profiles
  for select to authenticated
  using (public.is_production_role() and exists (
    select 1 from public.orders o where o.customer_id = profiles.id and public.is_assigned_job_order(o.id)));
create policy "profiles: admin all" on public.profiles
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "profiles: auth hook reads" on public.profiles
  for select to supabase_auth_admin using (true);

-- ---- suppliers ----
create policy "suppliers: public reads active" on public.suppliers
  for select to anon, authenticated using (status = 'active');
create policy "suppliers: contact reads own" on public.suppliers
  for select to authenticated using (public.is_supplier_contact_for(id));
create policy "suppliers: admin all" on public.suppliers
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- supplier_contacts ----
create policy "supplier_contacts: read own row" on public.supplier_contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "supplier_contacts: admin all" on public.supplier_contacts
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "supplier_contacts: auth hook reads" on public.supplier_contacts
  for select to supabase_auth_admin using (true);

-- ---- supplier_integrations: status only (no credentials_ref/base_url) via a view, below ----
create policy "supplier_integrations: admin all" on public.supplier_integrations
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- integration_sync_runs ----
create policy "integration_sync_runs: contact reads own supplier" on public.integration_sync_runs
  for select to authenticated using (public.is_supplier_contact_for(supplier_id));
create policy "integration_sync_runs: admin all" on public.integration_sync_runs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- fabrics ----
create policy "fabrics: public reads available" on public.fabrics
  for select to anon, authenticated
  using (is_available and not is_hidden
         and exists (select 1 from public.suppliers s where s.id = fabrics.supplier_id and s.status = 'active'));
create policy "fabrics: production reads on assigned jobs" on public.fabrics
  for select to authenticated
  using (public.is_production_role() and exists (
    select 1 from public.orders o where o.fabric_id = fabrics.id and public.is_assigned_job_order(o.id)));
create policy "fabrics: contact reads own supplier" on public.fabrics
  for select to authenticated using (public.is_supplier_contact_for(supplier_id));
create policy "fabrics: admin all" on public.fabrics
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- fabric_images: visible with the fabric ----
create policy "fabric_images: read with fabric" on public.fabric_images
  for select to anon, authenticated
  using (exists (select 1 from public.fabrics f where f.id = fabric_images.fabric_id));
create policy "fabric_images: admin all" on public.fabric_images
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- dress_templates / option_groups / option_values / template_options ----
create policy "dress_templates: public reads published" on public.dress_templates
  for select to anon, authenticated using (is_published);
create policy "dress_templates: production reads" on public.dress_templates
  for select to authenticated using (public.is_production_role());
create policy "dress_templates: admin all" on public.dress_templates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "option_groups: public read" on public.option_groups
  for select to anon, authenticated using (true);
create policy "option_groups: admin all" on public.option_groups
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "option_values: public read" on public.option_values
  for select to anon, authenticated using (true);
create policy "option_values: admin all" on public.option_values
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "template_options: public reads with published template" on public.template_options
  for select to anon, authenticated
  using (exists (select 1 from public.dress_templates t where t.id = template_options.template_id and t.is_published));
create policy "template_options: production reads" on public.template_options
  for select to authenticated using (public.is_production_role());
create policy "template_options: admin all" on public.template_options
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- order_drafts ----
create policy "order_drafts: own" on public.order_drafts
  for all to authenticated
  using (customer_id = (select auth.uid()) or agent_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()) or agent_id = (select auth.uid()));
create policy "order_drafts: agent reads for assigned customers" on public.order_drafts
  for select to authenticated using (public.is_assigned_agent_for(customer_id));
create policy "order_drafts: admin read" on public.order_drafts
  for select to authenticated using ((select public.is_admin()));

-- ---- measurement_profiles ----
create policy "measurement_profiles: own" on public.measurement_profiles
  for all to authenticated
  using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy "measurement_profiles: agent reads assigned customers" on public.measurement_profiles
  for select to authenticated using (public.is_assigned_agent_for(customer_id));
create policy "measurement_profiles: production reads on assigned jobs" on public.measurement_profiles
  for select to authenticated
  using (public.is_production_role() and exists (
    select 1 from public.orders o
     where o.measurement_profile_id = measurement_profiles.id and public.is_assigned_job_order(o.id)));
create policy "measurement_profiles: admin read" on public.measurement_profiles
  for select to authenticated using ((select public.is_admin()));

-- ---- orders: read only; writes go through fn_* functions. Production staff
--      read through production_order_view (below), never this table directly,
--      so cost/payment columns never reach a workbench account. ----
create policy "orders: customer reads own" on public.orders
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "orders: agent reads placed by self" on public.orders
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "orders: admin all" on public.orders
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- order_items / order_status_history: visible with the order ----
create policy "order_items: customer reads own" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.customer_id = (select auth.uid())));
create policy "order_items: agent reads placed by self" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.agent_id = (select auth.uid())));
create policy "order_items: production reads on assigned jobs" on public.order_items
  for select to authenticated using (public.is_production_role() and public.is_assigned_job_order(order_id));
create policy "order_items: admin all" on public.order_items
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "order_status_history: customer reads own" on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id and o.customer_id = (select auth.uid())));
create policy "order_status_history: agent reads placed by self" on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id and o.agent_id = (select auth.uid())));
create policy "order_status_history: production reads on assigned jobs" on public.order_status_history
  for select to authenticated using (public.is_production_role() and public.is_assigned_job_order(order_id));
create policy "order_status_history: admin all" on public.order_status_history
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- fabric_reservations: no direct reads for customer/agent/supplier_contact
--      (supplier_contact gets an aggregate view, below) ----
create policy "fabric_reservations: production reads on assigned jobs" on public.fabric_reservations
  for select to authenticated
  using (public.is_production_role() and order_id is not null and public.is_assigned_job_order(order_id));
create policy "fabric_reservations: admin all" on public.fabric_reservations
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- order_consents ----
create policy "order_consents: customer reads own" on public.order_consents
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "order_consents: agent writes for assigned customers" on public.order_consents
  for insert to authenticated with check (agent_id = (select auth.uid()) and public.is_assigned_agent_for(customer_id));
create policy "order_consents: agent reads own" on public.order_consents
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "order_consents: admin all" on public.order_consents
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- agents / agent_customers ----
create policy "agents: read own row" on public.agents
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "agents: admin all" on public.agents
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "agent_customers: agent reads own assignments" on public.agent_customers
  for select to authenticated using (agent_id = (select auth.uid()));
create policy "agent_customers: admin all" on public.agent_customers
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- production_jobs / production_events: full detail for assigned
--      production staff; customer/agent get a stage summary view, below ----
create policy "production_jobs: assigned staff" on public.production_jobs
  for select to authenticated using (public.is_production_role() and assigned_to_id = (select auth.uid()));
create policy "production_jobs: admin all" on public.production_jobs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "production_events: assigned staff" on public.production_events
  for select to authenticated
  using (exists (select 1 from public.production_jobs j
                  where j.id = production_events.job_id and j.assigned_to_id = (select auth.uid())));
create policy "production_events: admin all" on public.production_events
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "production_remakes: admin all" on public.production_remakes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- shipments ----
create policy "shipments: customer reads own" on public.shipments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = shipments.order_id and o.customer_id = (select auth.uid())));
create policy "shipments: agent reads placed by self" on public.shipments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = shipments.order_id and o.agent_id = (select auth.uid())));
create policy "shipments: dispatch all" on public.shipments
  for all to authenticated using (public.is_dispatch()) with check (public.is_dispatch());
create policy "shipments: admin all" on public.shipments
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- integration_outbox ----
create policy "integration_outbox: contact reads own supplier" on public.integration_outbox
  for select to authenticated using (public.is_supplier_contact_for(supplier_id));
create policy "integration_outbox: admin all" on public.integration_outbox
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- payments: customer only (per the RLS matrix, agent/production/supplier get none) ----
create policy "payments: customer reads own" on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = payments.order_id and o.customer_id = (select auth.uid())));
create policy "payments: admin all" on public.payments
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- admin-only tables ----
create policy "notification_templates: admin all" on public.notification_templates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "notification_outbox: admin read" on public.notification_outbox
  for select to authenticated using ((select public.is_admin()));
create policy "scan_deletion_log: admin read" on public.scan_deletion_log
  for select to authenticated using ((select public.is_admin()));
create policy "audit_log: admin read" on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- ---- reviews (P2) ----
create policy "reviews: public reads visible" on public.reviews
  for select to anon, authenticated using (not is_hidden);
create policy "reviews: customer reads own" on public.reviews
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "reviews: customer writes for own delivered order" on public.reviews
  for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (select 1 from public.orders o
                 where o.id = reviews.order_id and o.customer_id = (select auth.uid()) and o.status = 'delivered')
  );
create policy "reviews: customer updates own" on public.reviews
  for update to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy "reviews: admin all" on public.reviews
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 14. Narrow views for column-level privacy (SDS v2 §12.2)
--     RLS is row-level; these three cases need column-level narrowing, so each
--     gets a view instead of a wider table policy. Owned by the migration
--     role, which (unlike the querying user) is not subject to the RLS below
--     it, so the WHERE clause in each view is itself the access control.
-- -----------------------------------------------------------------------------

-- "Tailor, QC, dispatch: own job queue, without payment detail" — no SELECT
-- policy grants production staff the orders table directly; this view is the
-- only path, and it excludes fabric_cost/stitch_cost/options_cost/total/payment_status.
create view public.production_order_view as
select o.id, o.number, o.status, o.order_channel, o.template_id, o.fabric_id, o.supplier_id,
       o.measurement_profile_id, o.measurements_confirmed_by_id, o.measurements_confirmed_at,
       o.production_approved_by_id, o.production_approved_at, o.yardage_metres,
       o.est_delivery_date, o.created_at, o.updated_at
from public.orders o
where exists (select 1 from public.production_jobs j where j.order_id = o.id and j.assigned_to_id = (select auth.uid()))
   or (select public.is_admin());

grant select on public.production_order_view to authenticated;

-- "Production: stage summary only" for customer/agent — no SELECT policy
-- grants customer/agent the production_jobs table directly; this view excludes
-- assigned_to_id, priority and internal notes.
create view public.customer_job_status_view as
select j.id as job_id, j.order_id, j.stage, j.started_at, j.finished_at, j.updated_at
from public.production_jobs j
join public.orders o on o.id = j.order_id
where o.customer_id = (select auth.uid()) or o.agent_id = (select auth.uid()) or (select public.is_admin());

grant select on public.customer_job_status_view to authenticated;

-- "Supplier contact: aggregate reservation data on own fabrics" — no SELECT
-- policy grants supplier_contact the fabric_reservations table directly.
create view public.supplier_fabric_reservation_summary as
select f.supplier_id, fr.fabric_id, fr.kind, fr.status, sum(fr.metres) as metres, count(*) as reservation_count
from public.fabric_reservations fr
join public.fabrics f on f.id = fr.fabric_id
where public.is_supplier_contact_for(f.supplier_id) or (select public.is_admin())
group by f.supplier_id, fr.fabric_id, fr.kind, fr.status;

grant select on public.supplier_fabric_reservation_summary to authenticated;

-- "Supplier contact: integration status only, no credentials" — no SELECT
-- policy grants supplier_contact the supplier_integrations table directly.
create view public.supplier_integration_status_view as
select si.supplier_id, si.provider_kind, si.capabilities, si.status, si.last_sync_at
from public.supplier_integrations si
where public.is_supplier_contact_for(si.supplier_id) or (select public.is_admin());

grant select on public.supplier_integration_status_view to authenticated;


-- -----------------------------------------------------------------------------
-- 15. Realtime (production queue, order status, admin alerts)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.orders, public.order_status_history, public.production_jobs;


-- -----------------------------------------------------------------------------
-- 16. Storage buckets (SDS v2 §4.4) and policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true,  5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('scans',        'scans',        false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp']),
  ('production',   'production',   false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('exports',      'exports',      false, null,
     array['text/csv'])
on conflict (id) do nothing;

-- public-media: public read; write by admin only (the sync job uses the
-- service-role key and bypasses RLS entirely) — SDS v2 §4.4.
create policy "public-media: admin writes" on storage.objects
  for all to authenticated
  using (bucket_id = 'public-media' and (select public.is_admin()))
  with check (bucket_id = 'public-media' and (select public.is_admin()));

-- scans: private, under {order_id}/... Opt-in only (D10); customer uploads for
-- their own order, read by the customer, their placing agent, assigned
-- production staff and admin — deleted within 24h by scan-cleanup.
create policy "scans: customer uploads for own order" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scans'
    and exists (select 1 from public.orders o
                 where o.id::text = (storage.foldername(name))[1] and o.customer_id = (select auth.uid()))
  );

create policy "scans: read by order parties" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'scans'
    and exists (select 1 from public.orders o
                 where o.id::text = (storage.foldername(name))[1]
                   and (o.customer_id = (select auth.uid())
                        or o.agent_id = (select auth.uid())
                        or public.is_assigned_job_order(o.id)
                        or public.is_admin()))
  );

-- production: job sheets, QC photos — under {order_id}/..., production and admin only.
create policy "production bucket: assigned staff read/write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'production'
    and exists (select 1 from public.orders o
                 where o.id::text = (storage.foldername(name))[1]
                   and (public.is_assigned_job_order(o.id) or public.is_admin()))
  )
  with check (
    bucket_id = 'production'
    and exists (select 1 from public.orders o
                 where o.id::text = (storage.foldername(name))[1]
                   and (public.is_assigned_job_order(o.id) or public.is_admin()))
  );

-- exports: no policies — only server code with the service-role key can access it.


-- -----------------------------------------------------------------------------
-- 17. Background jobs (SDS v2 §11.3) — pg_cron + pg_net calling Edge Functions.
--     Enable pg_cron and pg_net (Dashboard → Database → Extensions), store the
--     project URL and service-role key in Vault, deploy the Edge Functions,
--     then run this block once (uncomment it).
-- -----------------------------------------------------------------------------
-- select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- select cron.schedule('catalogue-sync', '*/15 * * * *', $$
--   select net.http_post(
--     url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/catalogue-sync',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     body    := '{}'::jsonb);
-- $$);
--
-- select cron.schedule('notify-dispatch', '* * * * *', $$ ... /functions/v1/notify-dispatch ... $$);
-- select cron.schedule('integration-dispatch', '* * * * *', $$ ... /functions/v1/integration-dispatch ... $$);
-- select cron.schedule('reservation-expiry', '*/5 * * * *', $$ ... /functions/v1/reservation-expiry ... $$);
-- select cron.schedule('scan-cleanup', '0 * * * *', $$ ... /functions/v1/scan-cleanup ... $$);
-- select cron.schedule('stale-order-alert', '0 6 * * *', $$ ... /functions/v1/stale-order-alert ... $$);
