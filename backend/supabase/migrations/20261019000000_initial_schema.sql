-- =============================================================================
-- MultiFe — initial database schema (Supabase / Postgres)
-- Source: MultiFe Software Design Specification, §4 Data Design, §5 Order
-- Lifecycle, §8 Security Design.
--
-- Run order matters: enums → helpers → tables → functions → RLS → storage.
-- Safe to run once on a fresh Supabase project (SQL editor or `supabase db push`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type public.app_role             as enum ('customer', 'shopkeeper', 'admin');
create type public.account_status       as enum ('active', 'suspended');
create type public.shop_status          as enum ('pending', 'active', 'suspended');
create type public.member_role          as enum ('owner', 'staff');
create type public.measurement_source   as enum ('ai', 'manual', 'shop_corrected');
create type public.order_status         as enum (
  'placed', 'measurements_verified', 'confirmed', 'in_stitching',
  'ready', 'completed', 'rejected', 'cancelled'
);
create type public.fulfilment_mode      as enum ('pickup', 'delivery');
create type public.payment_method       as enum ('cod', 'pay_at_shop', 'online');
create type public.order_payment_status as enum ('unpaid', 'paid', 'refund_pending', 'refunded');
create type public.payment_status       as enum ('pending', 'paid', 'failed', 'refunded');
create type public.notification_channel as enum ('email', 'whatsapp');
create type public.notification_status  as enum ('pending', 'sent', 'failed');


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
-- 3. Tables (§4.2). Every table: id uuid PK, created_at, updated_at.
--    Money: numeric(12,2) in PKR.
-- -----------------------------------------------------------------------------

-- profiles: one row per auth user
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            public.app_role       not null default 'customer',
  full_name       text,
  phone           text,
  email           text,
  status          public.account_status not null default 'active',
  whatsapp_opt_in boolean               not null default false,  -- FR-NOT: customers can opt out
  created_at      timestamptz           not null default now(),
  updated_at      timestamptz           not null default now()
);

-- measurement_templates: which measurements a garment type needs
-- fields: [{ "key": "chest", "label": "Chest", "unit": "cm", "min": 60, "max": 160, "guide_image": "..." }]
create table public.measurement_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text  not null unique,
  fields     jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- categories: global list, managed by admin
create table public.categories (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  parent_id               uuid references public.categories (id) on delete set null,
  measurement_template_id uuid references public.measurement_templates (id) on delete set null,
  sort                    integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- shops: one storefront per shop at /s/{slug}
create table public.shops (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  logo_url         text,
  brand_color      text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  address          text,
  phone            text,
  hours            jsonb,  -- e.g. { "mon": ["10:00","20:00"], ... }
  fulfilment_modes public.fulfilment_mode[] not null default '{pickup}',
  status           public.shop_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- shop_members: shopkeepers (owner / staff) of a shop
create table public.shop_members (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  member_role public.member_role not null default 'staff',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shop_id, user_id)
);

-- products
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete set null,
  name         text not null,
  description  text,
  base_price   numeric(12,2) not null check (base_price >= 0),
  lead_days    integer not null default 7 check (lead_days >= 0),
  is_published boolean not null default false,
  is_hidden    boolean not null default false,  -- set by admin only (FR-ADM: hide rule-breaking products)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- product_images: Storage path or Cloudinary URL
create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url        text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- product_options: customer picks one value per group (fabric, collar, sleeve…)
-- ("group" is a reserved word in SQL, so the column is option_group)
create table public.product_options (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  option_group text not null,
  value        text not null,
  price_delta  numeric(12,2) not null default 0,
  is_available boolean not null default true,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (product_id, option_group, value)
);

-- measurement_profiles: a customer's saved measurement sets
-- ("values" is a reserved word in SQL, so the column is measurement_values)
create table public.measurement_profiles (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.profiles (id) on delete cascade,
  label              text not null default 'Me',
  measurement_values jsonb not null default '{}'::jsonb check (jsonb_typeof(measurement_values) = 'object'),  -- { "chest": 96.5, ... } in cm
  source             public.measurement_source not null default 'manual',
  confidence         jsonb check (confidence is null or jsonb_typeof(confidence) = 'object'),            -- { "chest": 0.82, ... } 0–1
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- carts: one shop per cart
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  shop_id     uuid not null references public.shops (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (customer_id, shop_id)
);

-- cart_items: options = { "<option_group>": "<product_options.id>", ... }
create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  options    jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  qty        integer not null default 1 check (qty between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- orders
create sequence public.order_number_seq;

create table public.orders (
  id                       uuid primary key default gen_random_uuid(),
  number                   text not null unique
                             default ('MF-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  customer_id              uuid not null references public.profiles (id) on delete restrict,
  shop_id                  uuid not null references public.shops (id) on delete restrict,
  measurement_profile_id   uuid references public.measurement_profiles (id) on delete set null,
  status                   public.order_status not null default 'placed',
  fulfilment               public.fulfilment_mode not null,
  address                  jsonb,
  payment_method           public.payment_method not null,
  subtotal                 numeric(12,2) not null default 0 check (subtotal >= 0),
  total                    numeric(12,2) not null default 0 check (total >= 0),
  payment_status           public.order_payment_status not null default 'unpaid',
  measurements_approved_by uuid references public.profiles (id) on delete set null,
  measurements_approved_at timestamptz,
  est_ready_date           date,
  admin_note               text,  -- FR-ADM: admin can add a note on disputes
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (fulfilment <> 'delivery' or address is not null)
);

-- order_items: snapshot — later product or profile edits do not change it
create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  options      jsonb not null default '[]'::jsonb,  -- [{ option_id, group, value, price_delta }]
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  qty          integer not null check (qty > 0),
  measurements jsonb,                                -- snapshot; replaced by approved values at review
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- order_status_history: written only by fn_transition_order / fn_place_order
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- payments: event_id makes gateway webhooks idempotent
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  method      public.payment_method not null,
  amount      numeric(12,2) not null check (amount >= 0),
  status      public.payment_status not null default 'pending',
  gateway_ref text,
  event_id    text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- notification_templates: editable by admin (P2)
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

-- notification_outbox: written in the same transaction as the state change (D8)
create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references public.orders (id) on delete set null,
  channel         public.notification_channel not null,
  recipient       text not null,
  template        text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          public.notification_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- scan_deletion_log: proof of the 24-hour scan deletion policy
create table public.scan_deletion_log (
  id            uuid primary key default gen_random_uuid(),
  run_at        timestamptz not null default now(),
  files_deleted integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- audit_log: admin and sensitive actions
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

-- reviews (P2): one per completed order
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  shop_id     uuid not null references public.shops (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  is_hidden   boolean not null default false,  -- set by admin only
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 4. Indexes (§4.2, §9.4) + foreign-key indexes
-- -----------------------------------------------------------------------------
create index orders_shop_status_created_idx    on public.orders (shop_id, status, created_at desc);
create index orders_customer_created_idx       on public.orders (customer_id, created_at desc);
create index products_shop_published_idx       on public.products (shop_id, is_published);
create index products_category_idx             on public.products (category_id);
create index order_status_history_order_idx    on public.order_status_history (order_id, created_at);
create index order_items_order_idx             on public.order_items (order_id);
create index payments_order_idx                on public.payments (order_id);
create index product_images_product_idx        on public.product_images (product_id, sort);
create index product_options_product_idx       on public.product_options (product_id);
create index shop_members_user_idx             on public.shop_members (user_id);
create index measurement_profiles_customer_idx on public.measurement_profiles (customer_id);
create index cart_items_cart_idx               on public.cart_items (cart_id);
create index categories_parent_idx             on public.categories (parent_id);
create index reviews_shop_idx                  on public.reviews (shop_id);
create index audit_log_entity_idx              on public.audit_log (entity, entity_id);
create index audit_log_created_idx             on public.audit_log (created_at desc);
create index notification_outbox_pending_idx   on public.notification_outbox (next_attempt_at)
  where status = 'pending';


-- -----------------------------------------------------------------------------
-- 5. updated_at triggers on every table
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'measurement_templates', 'categories', 'shops', 'shop_members',
    'products', 'product_images', 'product_options', 'measurement_profiles',
    'carts', 'cart_items', 'orders', 'order_items', 'order_status_history',
    'payments', 'notification_templates', 'notification_outbox',
    'scan_deletion_log', 'audit_log', 'reviews'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Role helpers used by RLS (SECURITY DEFINER so they don't recurse into RLS)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_shop_member(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_members m
    join public.profiles p on p.id = m.user_id
    where m.shop_id = p_shop_id
      and m.user_id = (select auth.uid())
      and p.status = 'active'
  );
$$;

create or replace function public.is_shop_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_members m
    join public.profiles p on p.id = m.user_id
    where m.shop_id = p_shop_id
      and m.user_id = (select auth.uid())
      and m.member_role = 'owner'
      and p.status = 'active'
  );
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
  for each row execute function public.guard_admin_columns('role', 'status');
create trigger guard_admin_columns before update on public.shops
  for each row execute function public.guard_admin_columns('status');
create trigger guard_admin_columns before update on public.products
  for each row execute function public.guard_admin_columns('is_hidden');
create trigger guard_admin_columns before update on public.reviews
  for each row execute function public.guard_admin_columns('is_hidden');

-- D7: order status changes only through fn_transition_order.
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


-- -----------------------------------------------------------------------------
-- 8. Auth integration
-- -----------------------------------------------------------------------------

-- Create a profile for each new auth user. Role defaults to customer.
-- Shopkeepers/admins join by invite only: the server sets app_metadata
-- (role, shop_id, member_role) with the service-role key. user_metadata is
-- never trusted for roles because users can set it themselves at sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_shop uuid;
begin
  v_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'customer')::public.app_role;

  insert into public.profiles (id, role, full_name, phone, email)
  values (new.id, v_role, new.raw_user_meta_data ->> 'full_name', new.phone, new.email);

  v_shop := nullif(new.raw_app_meta_data ->> 'shop_id', '')::uuid;
  if v_shop is not null and v_role = 'shopkeeper' then
    insert into public.shop_members (shop_id, user_id, member_role)
    values (
      v_shop, new.id,
      coalesce(nullif(new.raw_app_meta_data ->> 'member_role', ''), 'staff')::public.member_role
    );
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

-- §8.1: custom access token hook — adds app_role and shop_id claims to the JWT.
-- (The claim is "app_role", not "role": "role" is the Postgres role Supabase
-- uses for the request and must stay "authenticated".)
-- Enable it in Dashboard → Authentication → Hooks → Custom Access Token.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user   uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_role   public.app_role;
  v_status public.account_status;
  v_shop   uuid;
begin
  select role, status into v_role, v_status
  from public.profiles where id = v_user;

  select shop_id into v_shop
  from public.shop_members
  where user_id = v_user
  order by (member_role = 'owner') desc, created_at
  limit 1;

  v_claims := v_claims
    || jsonb_build_object(
         'app_role',       coalesce(v_role::text, 'customer'),
         'account_status', coalesce(v_status::text, 'active'),
         'shop_id',        v_shop
       );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant select on public.profiles, public.shop_members to supabase_auth_admin;


-- -----------------------------------------------------------------------------
-- 9. Notifications (D8 outbox)
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

-- Enqueue the messages for one order event.
--   p_customer_template → email to the customer (and WhatsApp if p_whatsapp and opted in)
--   p_shop_template     → email to the shop's owners
create or replace function public.fn_notify_order(
  p_order_id          uuid,
  p_customer_template text,
  p_whatsapp          boolean default false,
  p_shop_template     text default null,
  p_reason            text default null,
  p_email_customer    boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_shop     public.shops;
  v_customer public.profiles;
  v_payload  jsonb;
  v_owner    record;
begin
  select * into v_order    from public.orders   where id = p_order_id;
  select * into v_shop     from public.shops    where id = v_order.shop_id;
  select * into v_customer from public.profiles where id = v_order.customer_id;

  v_payload := jsonb_build_object(
    'order_id',       v_order.id,
    'order_number',   v_order.number,
    'status',         v_order.status,
    'total',          v_order.total,
    'est_ready_date', v_order.est_ready_date,
    'shop_name',      v_shop.name,
    'shop_slug',      v_shop.slug,
    'shop_phone',     v_shop.phone,
    'customer_name',  v_customer.full_name,
    'reason',         p_reason
  );

  if p_customer_template is not null then
    if p_email_customer then
      perform public.fn_enqueue_notification(v_order.id, 'email', v_customer.email, p_customer_template, v_payload);
    end if;
    if p_whatsapp and v_customer.whatsapp_opt_in then
      perform public.fn_enqueue_notification(v_order.id, 'whatsapp', v_customer.phone, p_customer_template, v_payload);
    end if;
  end if;

  if p_shop_template is not null then
    for v_owner in
      select p.email
      from public.shop_members m
      join public.profiles p on p.id = m.user_id
      where m.shop_id = v_order.shop_id and m.member_role = 'owner' and p.status = 'active'
    loop
      perform public.fn_enqueue_notification(v_order.id, 'email', v_owner.email, p_shop_template, v_payload);
    end loop;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. Order lifecycle (§5) — the only way an order's status changes
-- -----------------------------------------------------------------------------
create or replace function public.fn_transition_order(
  p_order_id  uuid,
  p_to_status public.order_status,
  p_reason    text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_order          public.orders;
  v_from           public.order_status;
  v_is_admin       boolean := public.is_admin()
                              or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_shop        boolean;
  v_is_customer    boolean;
  v_by_admin       boolean := false;
  v_reason         text := nullif(btrim(p_reason), '');
  v_ready          date;
  v_payment_status public.order_payment_status;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_from        := v_order.status;
  v_is_shop     := public.is_shop_member(v_order.shop_id);
  v_is_customer := v_uid is not null and v_order.customer_id = v_uid;

  if not (v_is_admin or v_is_shop or v_is_customer) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if v_from in ('completed', 'rejected', 'cancelled') then
    raise exception 'Order % is already %', v_order.number, v_from using errcode = '22023';
  end if;

  -- Allowed moves and guards
  if p_to_status = 'cancelled' then
    if v_is_customer and v_from in ('placed', 'measurements_verified', 'confirmed') then
      null;  -- customer may cancel before stitching starts
    elsif v_is_admin then
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;
      v_by_admin := true;
    else
      raise exception 'This order can no longer be cancelled' using errcode = '42501';
    end if;

  else
    if not v_is_shop then
      raise exception 'Only the shop can move an order to %', p_to_status using errcode = '42501';
    end if;

    if v_from = 'placed' and p_to_status = 'measurements_verified' then
      if v_order.measurements_approved_at is null then
        raise exception 'Approve the measurements first (fn_approve_measurements)' using errcode = '22023';
      end if;

    elsif v_from = 'placed' and p_to_status = 'rejected' then
      if v_reason is null then
        raise exception 'A reason is required' using errcode = '22023';
      end if;

    elsif v_from = 'measurements_verified' and p_to_status = 'confirmed' then
      if v_order.payment_method = 'online' and v_order.payment_status <> 'paid' then
        raise exception 'Online orders must be paid before they are confirmed' using errcode = '22023';
      end if;
      select current_date + coalesce(max(p.lead_days), 0)
        into v_ready
        from public.order_items i
        join public.products p on p.id = i.product_id
       where i.order_id = v_order.id;

    elsif v_from = 'confirmed' and p_to_status = 'in_stitching' then
      null;

    elsif v_from = 'in_stitching' and p_to_status = 'ready' then
      null;

    elsif v_from = 'ready' and p_to_status = 'completed' then
      if v_order.payment_status <> 'paid' then
        raise exception 'Mark the order as paid before completing it' using errcode = '22023';
      end if;

    else
      raise exception 'Cannot move an order from % to %', v_from, p_to_status using errcode = '22023';
    end if;
  end if;

  -- Online payment is refunded when an order is rejected or cancelled
  v_payment_status := v_order.payment_status;
  if p_to_status in ('rejected', 'cancelled')
     and v_order.payment_method = 'online'
     and v_order.payment_status = 'paid' then
    v_payment_status := 'refund_pending';
  end if;

  perform set_config('multife.status_transition', 'on', true);
  update public.orders
     set status         = p_to_status,
         payment_status = v_payment_status,
         est_ready_date = coalesce(v_ready, est_ready_date)
   where id = p_order_id
  returning * into v_order;
  perform set_config('multife.status_transition', 'off', true);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
  values (v_order.id, v_from, p_to_status, v_uid, v_reason);

  -- Side effects
  case p_to_status
    when 'rejected' then
      perform public.fn_notify_order(v_order.id, 'order_rejected', false, null, v_reason);
    when 'confirmed' then
      perform public.fn_notify_order(v_order.id, 'order_confirmed', true);
    when 'ready' then
      perform public.fn_notify_order(v_order.id, 'order_ready', true);
    when 'completed' then
      perform public.fn_notify_order(v_order.id, 'order_completed', true, null, null, false);
    when 'cancelled' then
      if v_by_admin then
        perform public.fn_notify_order(v_order.id, 'order_cancelled', false, 'order_cancelled_shop', v_reason);
        insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
        values (
          v_uid, 'order.cancel', 'orders', v_order.id,
          jsonb_build_object('status', v_from),
          jsonb_build_object('status', 'cancelled', 'reason', v_reason)
        );
      else
        perform public.fn_notify_order(v_order.id, null, false, 'order_cancelled_shop', v_reason);
      end if;
    else
      null;
  end case;

  return v_order;
end;
$$;


-- Shopkeeper review (FR-SEL-06): validate against the garment templates,
-- save approved values on the order, then move it to measurements_verified.
-- p_values: { "chest": 96.5, "waist": 84, ... } in cm
create or replace function public.fn_approve_measurements(p_order_id uuid, p_values jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_field  jsonb;
  v_key    text;
  v_label  text;
  v_num    numeric;
  v_errors text[] := '{}';
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if not public.is_shop_member(v_order.shop_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_order.status <> 'placed' then
    raise exception 'Measurements can only be approved while the order is placed' using errcode = '22023';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Measurements must be a JSON object' using errcode = '22023';
  end if;

  for v_field in
    select distinct f.value
    from public.order_items i
    join public.products p              on p.id = i.product_id
    join public.categories c            on c.id = p.category_id
    join public.measurement_templates t on t.id = c.measurement_template_id
    cross join lateral jsonb_array_elements(t.fields) as f(value)
    where i.order_id = p_order_id
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
    raise exception 'Invalid measurements: %', array_to_string(v_errors, '; ')
      using errcode = '22023';
  end if;

  update public.order_items set measurements = p_values where order_id = p_order_id;

  update public.orders
     set measurements_approved_by = (select auth.uid()),
         measurements_approved_at = now()
   where id = p_order_id;

  return public.fn_transition_order(p_order_id, 'measurements_verified');
end;
$$;


-- placeOrder (§7.1): re-price the cart on the server, snapshot items and
-- measurements, create the order as placed, empty the cart, enqueue "order placed".
-- p_address example: { "line1": "...", "city": "Lahore", "phone": "..." }
create or replace function public.fn_place_order(
  p_cart_id                uuid,
  p_measurement_profile_id uuid,
  p_fulfilment             public.fulfilment_mode,
  p_payment_method         public.payment_method,
  p_address                jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_cart      public.carts;
  v_shop      public.shops;
  v_profile   public.measurement_profiles;
  v_item      public.cart_items;
  v_product   public.products;
  v_options   jsonb;
  v_delta     numeric(12,2);
  v_matched   integer;
  v_unit      numeric(12,2);
  v_subtotal  numeric(12,2) := 0;
  v_count     integer := 0;
  v_order     public.orders;
begin
  if v_uid is null then
    raise exception 'Sign in to place an order' using errcode = '42501';
  end if;

  select * into v_cart from public.carts
   where id = p_cart_id and customer_id = v_uid
   for update;
  if not found then
    raise exception 'Cart not found' using errcode = 'P0002';
  end if;

  select * into v_shop from public.shops where id = v_cart.shop_id;
  if v_shop.status <> 'active' then
    raise exception 'This shop is not taking orders' using errcode = '22023';
  end if;
  if not (p_fulfilment = any (v_shop.fulfilment_modes)) then
    raise exception 'This shop does not offer %', p_fulfilment using errcode = '22023';
  end if;
  if p_fulfilment = 'delivery' and (p_address is null or p_address = '{}'::jsonb) then
    raise exception 'A delivery address is required' using errcode = '22023';
  end if;

  select * into v_profile from public.measurement_profiles
   where id = p_measurement_profile_id and customer_id = v_uid;
  if not found then
    raise exception 'Choose one of your measurement profiles' using errcode = '22023';
  end if;

  insert into public.orders (customer_id, shop_id, measurement_profile_id, fulfilment,
                             address, payment_method)
  values (v_uid, v_shop.id, v_profile.id, p_fulfilment,
          case when p_fulfilment = 'delivery' then p_address end, p_payment_method)
  returning * into v_order;

  for v_item in
    select * from public.cart_items where cart_id = v_cart.id order by created_at
  loop
    select * into v_product from public.products
     where id = v_item.product_id
       and shop_id = v_shop.id
       and is_published
       and not is_hidden;
    if not found then
      raise exception 'A product in your cart is no longer available' using errcode = '22023';
    end if;

    -- options: { "<group>": "<option id>" } — look up prices on the server
    select coalesce(jsonb_agg(jsonb_build_object(
             'option_id',   o.id,
             'group',       o.option_group,
             'value',       o.value,
             'price_delta', o.price_delta) order by o.option_group), '[]'::jsonb),
           coalesce(sum(o.price_delta), 0),
           count(o.id)
      into v_options, v_delta, v_matched
      from jsonb_each_text(v_item.options) as sel(grp, option_id)
      join public.product_options o
        on o.id::text = sel.option_id
       and o.option_group = sel.grp
       and o.product_id = v_product.id
       and o.is_available;

    if v_matched <> (select count(*) from jsonb_object_keys(v_item.options)) then
      raise exception 'An option you chose for % is no longer available', v_product.name
        using errcode = '22023';
    end if;

    v_unit := v_product.base_price + v_delta;

    insert into public.order_items (order_id, product_id, product_name, options,
                                    unit_price, qty, measurements)
    values (v_order.id, v_product.id, v_product.name, v_options,
            v_unit, v_item.qty, v_profile.measurement_values);

    v_subtotal := v_subtotal + v_unit * v_item.qty;
    v_count    := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;

  update public.orders
     set subtotal = v_subtotal, total = v_subtotal
   where id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id)
  values (v_order.id, null, 'placed', v_uid);

  delete from public.cart_items where cart_id = v_cart.id;

  perform public.fn_notify_order(v_order.id, 'order_placed');

  return v_order;
end;
$$;


-- Offline payment (FR-PAY): shopkeeper marks COD / pay-at-shop as paid.
create or replace function public.fn_mark_order_paid(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if not public.is_shop_member(v_order.shop_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_order.payment_method = 'online' then
    raise exception 'Online payments are confirmed by the payment gateway' using errcode = '22023';
  end if;
  if v_order.status in ('rejected', 'cancelled') then
    raise exception 'Order % is %', v_order.number, v_order.status using errcode = '22023';
  end if;
  if v_order.payment_status = 'paid' then
    return v_order;
  end if;

  insert into public.payments (order_id, method, amount, status)
  values (v_order.id, v_order.payment_method, v_order.total, 'paid');

  update public.orders set payment_status = 'paid'
   where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;


-- Payment webhook (§7.1): called by server code with the service-role key only.
-- Returns false when the event was already recorded (idempotent replay).
create or replace function public.fn_record_online_payment(
  p_order_id    uuid,
  p_amount      numeric,
  p_gateway_ref text,
  p_event_id    text,
  p_status      public.payment_status default 'paid'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payments (order_id, method, amount, status, gateway_ref, event_id)
  values (p_order_id, 'online', p_amount, p_status, p_gateway_ref, p_event_id)
  on conflict (event_id) do nothing;

  if not found then
    return false;
  end if;

  if p_status = 'paid' then
    update public.orders set payment_status = 'paid'
     where id = p_order_id and payment_status = 'unpaid';
  elsif p_status = 'refunded' then
    update public.orders set payment_status = 'refunded'
     where id = p_order_id;
  end if;

  return true;
end;
$$;


-- -----------------------------------------------------------------------------
-- 11. Function permissions
--     (Supabase grants EXECUTE on new public functions to anon/authenticated
--      by default, so lock down the ones that must not be called from the API.)
-- -----------------------------------------------------------------------------
revoke execute on function public.fn_enqueue_notification(uuid, public.notification_channel, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.fn_notify_order(uuid, text, boolean, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.handle_user_contact_change() from public, anon, authenticated;

revoke execute on function public.fn_record_online_payment(uuid, numeric, text, text, public.payment_status)
  from public, anon, authenticated;
grant  execute on function public.fn_record_online_payment(uuid, numeric, text, text, public.payment_status)
  to service_role;

revoke execute on function public.fn_place_order(uuid, uuid, public.fulfilment_mode, public.payment_method, jsonb)
  from public, anon;
revoke execute on function public.fn_transition_order(uuid, public.order_status, text) from public, anon;
revoke execute on function public.fn_approve_measurements(uuid, jsonb)                 from public, anon;
revoke execute on function public.fn_mark_order_paid(uuid)                             from public, anon;

grant execute on function public.fn_place_order(uuid, uuid, public.fulfilment_mode, public.payment_method, jsonb)
  to authenticated;
grant execute on function public.fn_transition_order(uuid, public.order_status, text) to authenticated;
grant execute on function public.fn_approve_measurements(uuid, jsonb)                 to authenticated;
grant execute on function public.fn_mark_order_paid(uuid)                             to authenticated;


-- -----------------------------------------------------------------------------
-- 12. Row-Level Security (§8.2)
-- -----------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.measurement_templates  enable row level security;
alter table public.categories             enable row level security;
alter table public.shops                  enable row level security;
alter table public.shop_members           enable row level security;
alter table public.products               enable row level security;
alter table public.product_images         enable row level security;
alter table public.product_options        enable row level security;
alter table public.measurement_profiles   enable row level security;
alter table public.carts                  enable row level security;
alter table public.cart_items             enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.order_status_history   enable row level security;
alter table public.payments               enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_outbox    enable row level security;
alter table public.scan_deletion_log      enable row level security;
alter table public.audit_log              enable row level security;
alter table public.reviews                enable row level security;

-- ---- profiles ----
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: shop reads its customers and members" on public.profiles
  for select to authenticated
  using (
    exists (select 1 from public.orders o
             where o.customer_id = profiles.id and public.is_shop_member(o.shop_id))
    or exists (select 1 from public.shop_members m
                where m.user_id = profiles.id and public.is_shop_member(m.shop_id))
  );

create policy "profiles: admin all" on public.profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "profiles: auth hook reads" on public.profiles
  for select to supabase_auth_admin
  using (true);

-- ---- measurement_templates / categories (global, admin-managed) ----
create policy "measurement_templates: public read" on public.measurement_templates
  for select to anon, authenticated using (true);
create policy "measurement_templates: admin all" on public.measurement_templates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "categories: public read" on public.categories
  for select to anon, authenticated using (true);
create policy "categories: admin all" on public.categories
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- shops ----
create policy "shops: public reads active" on public.shops
  for select to anon, authenticated
  using (status = 'active');

create policy "shops: members read own" on public.shops
  for select to authenticated
  using (public.is_shop_member(id));

create policy "shops: owner updates own" on public.shops
  for update to authenticated
  using (public.is_shop_owner(id))
  with check (public.is_shop_owner(id));

create policy "shops: admin all" on public.shops
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- shop_members ----
create policy "shop_members: read own shop" on public.shop_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_shop_member(shop_id));

create policy "shop_members: owner adds staff" on public.shop_members
  for insert to authenticated
  with check (public.is_shop_owner(shop_id) and member_role = 'staff');

create policy "shop_members: owner removes staff" on public.shop_members
  for delete to authenticated
  using (public.is_shop_owner(shop_id) and member_role = 'staff');

create policy "shop_members: admin all" on public.shop_members
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "shop_members: auth hook reads" on public.shop_members
  for select to supabase_auth_admin
  using (true);

-- ---- products ----
create policy "products: public reads published of active shops" on public.products
  for select to anon, authenticated
  using (
    is_published and not is_hidden
    and exists (select 1 from public.shops s where s.id = products.shop_id and s.status = 'active')
  );

create policy "products: members manage own shop" on public.products
  for all to authenticated
  using (public.is_shop_member(shop_id))
  with check (public.is_shop_member(shop_id));

create policy "products: admin all" on public.products
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- product_images / product_options: visible when the product is visible ----
create policy "product_images: read with product" on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_images.product_id));

create policy "product_images: members manage own shop" on public.product_images
  for all to authenticated
  using (exists (select 1 from public.products p
                  where p.id = product_images.product_id and public.is_shop_member(p.shop_id)))
  with check (exists (select 1 from public.products p
                       where p.id = product_images.product_id and public.is_shop_member(p.shop_id)));

create policy "product_images: admin all" on public.product_images
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "product_options: read with product" on public.product_options
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_options.product_id));

create policy "product_options: members manage own shop" on public.product_options
  for all to authenticated
  using (exists (select 1 from public.products p
                  where p.id = product_options.product_id and public.is_shop_member(p.shop_id)))
  with check (exists (select 1 from public.products p
                       where p.id = product_options.product_id and public.is_shop_member(p.shop_id)));

create policy "product_options: admin all" on public.product_options
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- measurement_profiles ----
create policy "measurement_profiles: own" on public.measurement_profiles
  for all to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

create policy "measurement_profiles: shop reads ones on its orders" on public.measurement_profiles
  for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.measurement_profile_id = measurement_profiles.id
                    and public.is_shop_member(o.shop_id)));

create policy "measurement_profiles: admin read" on public.measurement_profiles
  for select to authenticated
  using ((select public.is_admin()));

-- ---- carts / cart_items ----
create policy "carts: own" on public.carts
  for all to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

create policy "carts: admin read" on public.carts
  for select to authenticated
  using ((select public.is_admin()));

create policy "cart_items: own" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c
                  where c.id = cart_items.cart_id and c.customer_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c
                       join public.products p on p.id = cart_items.product_id
                       where c.id = cart_items.cart_id
                         and c.customer_id = (select auth.uid())
                         and p.shop_id = c.shop_id));  -- one shop per cart

create policy "cart_items: admin read" on public.cart_items
  for select to authenticated
  using ((select public.is_admin()));

-- ---- orders: read only; writes go through the fn_* functions ----
create policy "orders: customer reads own" on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "orders: shop reads own" on public.orders
  for select to authenticated
  using (public.is_shop_member(shop_id));

create policy "orders: admin read" on public.orders
  for select to authenticated
  using ((select public.is_admin()));

create policy "orders: admin update (notes)" on public.orders
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- order_items / order_status_history / payments: visible with the order ----
create policy "order_items: read with order" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));

create policy "order_status_history: read with order" on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

create policy "payments: read with order" on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = payments.order_id));

-- ---- admin-only tables ----
create policy "notification_templates: admin all" on public.notification_templates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "notification_outbox: admin read" on public.notification_outbox
  for select to authenticated
  using ((select public.is_admin()));

create policy "scan_deletion_log: admin read" on public.scan_deletion_log
  for select to authenticated
  using ((select public.is_admin()));

create policy "audit_log: admin read" on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- ---- reviews (P2) ----
create policy "reviews: public reads visible" on public.reviews
  for select to anon, authenticated
  using (not is_hidden);

create policy "reviews: customer reads own" on public.reviews
  for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "reviews: customer writes for own completed order" on public.reviews
  for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (select 1 from public.orders o
                 where o.id = reviews.order_id
                   and o.customer_id = (select auth.uid())
                   and o.shop_id = reviews.shop_id
                   and o.status = 'completed')
  );

create policy "reviews: customer updates own" on public.reviews
  for update to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

create policy "reviews: shop reads own" on public.reviews
  for select to authenticated
  using (public.is_shop_member(shop_id));

create policy "reviews: admin all" on public.reviews
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 13. Realtime (seller's live order queue, customer's order page)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders, public.order_status_history;


-- -----------------------------------------------------------------------------
-- 14. Storage buckets (§4.3) and policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true,  5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('scans',        'scans',        false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp']),
  ('exports',      'exports',      false, null,
     array['text/csv'])
on conflict (id) do nothing;

-- public-media: public read (via public URL); shop members write under {shop_id}/...
create policy "public-media: members read own folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'public-media'
    and exists (select 1 from public.shop_members m
                 where m.user_id = (select auth.uid())
                   and m.shop_id::text = (storage.foldername(name))[1])
  );

create policy "public-media: members upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'public-media'
    and exists (select 1 from public.shop_members m
                 where m.user_id = (select auth.uid())
                   and m.shop_id::text = (storage.foldername(name))[1])
  );

create policy "public-media: members update own folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'public-media'
    and exists (select 1 from public.shop_members m
                 where m.user_id = (select auth.uid())
                   and m.shop_id::text = (storage.foldername(name))[1])
  );

create policy "public-media: members delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'public-media'
    and exists (select 1 from public.shop_members m
                 where m.user_id = (select auth.uid())
                   and m.shop_id::text = (storage.foldername(name))[1])
  );

create policy "public-media: admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'public-media' and (select public.is_admin()))
  with check (bucket_id = 'public-media' and (select public.is_admin()));

-- scans: private, under {order_id}/... — customer uploads for own order;
-- customer, that order's shop and admins can read (to create signed URLs).
-- Deleted within 24h by the scan-cleanup Edge Function (service role).
create policy "scans: customer uploads for own order" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scans'
    and exists (select 1 from public.orders o
                 where o.id::text = (storage.foldername(name))[1]
                   and o.customer_id = (select auth.uid()))
  );

create policy "scans: read by order parties" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'scans'
    and exists (select 1 from public.orders o
                 where o.id::text = (storage.foldername(name))[1]
                   and (o.customer_id = (select auth.uid())
                        or public.is_shop_member(o.shop_id)
                        or public.is_admin()))
  );

-- exports: no policies — only server code with the service-role key can access it.


-- -----------------------------------------------------------------------------
-- 15. Background jobs (§7.2) — pg_cron + pg_net calling Edge Functions.
--     Enable pg_cron and pg_net (Dashboard → Database → Extensions), store the
--     project URL and service-role key in Vault, deploy the Edge Functions,
--     then run this block once (uncomment it).
-- -----------------------------------------------------------------------------
-- select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- select cron.schedule('notify-dispatch', '* * * * *', $$
--   select net.http_post(
--     url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify-dispatch',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     body    := '{}'::jsonb);
-- $$);
--
-- select cron.schedule('scan-cleanup', '0 * * * *', $$
--   select net.http_post(
--     url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scan-cleanup',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     body    := '{}'::jsonb);
-- $$);
