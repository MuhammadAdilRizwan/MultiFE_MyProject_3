-- MultiFe v2.0 — starter reference data. Run after the migration.
-- Measurement ranges and yardage formulas are placeholders in cm/metres;
-- adjust with the client's tailors during build (SDS v2 §8.1).

insert into public.option_groups (key, label, sort) values
('neckline', 'Neckline', 1),
('sleeve',   'Sleeve',   2),
('cuff',     'Cuff',     3),
('bottom',   'Bottom',   4),
('closure',  'Closure',  5);

insert into public.option_values (group_id, key, label, sort)
select g.id, v.key, v.label, v.sort
from (values
  ('neckline', 'round',          'Round neck',       1),
  ('neckline', 'v-neck',         'V-neck',            2),
  ('neckline', 'boat',           'Boat neck',         3),
  ('sleeve',   'full',           'Full sleeve',       1),
  ('sleeve',   'three-quarter',  'Three-quarter',     2),
  ('sleeve',   'sleeveless',     'Sleeveless',        3),
  ('cuff',     'soft',           'Soft cuff',         1),
  ('cuff',     'rolled',         'Rolled cuff',       2),
  ('cuff',     'hard',           'Hard cuff',         3),
  ('bottom',   'straight',       'Straight',          1),
  ('bottom',   'flared',         'Flared',            2),
  ('closure',  'buttons',        'Buttons',           1),
  ('closure',  'zip',            'Zip',               2)
) as v(group_key, key, label, sort)
join public.option_groups g on g.key = v.group_key;

insert into public.dress_templates (name, slug, description, base_stitch_price, lead_days, required_measurements, yardage_formula, is_published) values
('Shalwar Kameez', 'shalwar-kameez', 'Classic two-piece shalwar kameez', 2500, 10,
 '[
   {"key":"height",         "label":"Height",          "unit":"cm", "min":120, "max":220},
   {"key":"neck",           "label":"Neck",            "unit":"cm", "min":28,  "max":55},
   {"key":"shoulder_width", "label":"Shoulder width",  "unit":"cm", "min":30,  "max":65},
   {"key":"chest",          "label":"Chest",           "unit":"cm", "min":60,  "max":160},
   {"key":"waist",          "label":"Waist",           "unit":"cm", "min":50,  "max":160},
   {"key":"hip",            "label":"Hip",             "unit":"cm", "min":60,  "max":170},
   {"key":"sleeve",         "label":"Sleeve length",   "unit":"cm", "min":40,  "max":80}
 ]'::jsonb,
 '{"base_metres": 4.5, "coefficients": {"chest": 0.015, "hip": 0.01}, "wastage_margin": 0.1}'::jsonb,
 true),
('Kurti', 'kurti', 'Short, fitted kurti', 1800, 7,
 '[
   {"key":"neck",           "label":"Neck",            "unit":"cm", "min":28,  "max":55},
   {"key":"shoulder_width", "label":"Shoulder width",  "unit":"cm", "min":30,  "max":65},
   {"key":"chest",          "label":"Chest",           "unit":"cm", "min":60,  "max":160},
   {"key":"waist",          "label":"Waist",           "unit":"cm", "min":50,  "max":160},
   {"key":"sleeve",         "label":"Sleeve length",   "unit":"cm", "min":40,  "max":80},
   {"key":"kameez_length",  "label":"Kurti length",    "unit":"cm", "min":60,  "max":110}
 ]'::jsonb,
 '{"base_metres": 2.5, "coefficients": {"chest": 0.012}, "wastage_margin": 0.1}'::jsonb,
 true),
('Long Dress', 'long-dress', 'Floor-length fitted dress', 3200, 12,
 '[
   {"key":"neck",           "label":"Neck",            "unit":"cm", "min":28,  "max":55},
   {"key":"shoulder_width", "label":"Shoulder width",  "unit":"cm", "min":30,  "max":65},
   {"key":"chest",          "label":"Chest",           "unit":"cm", "min":60,  "max":160},
   {"key":"waist",          "label":"Waist",           "unit":"cm", "min":50,  "max":160},
   {"key":"hip",            "label":"Hip",             "unit":"cm", "min":60,  "max":170},
   {"key":"sleeve",         "label":"Sleeve length",   "unit":"cm", "min":40,  "max":80},
   {"key":"dress_length",   "label":"Dress length",    "unit":"cm", "min":120, "max":170}
 ]'::jsonb,
 '{"base_metres": 5.5, "coefficients": {"chest": 0.016, "hip": 0.012}, "wastage_margin": 0.12}'::jsonb,
 true);

-- Each template offers neckline/sleeve for all three; cuff and closure vary.
insert into public.template_options (template_id, group_id, value_id, price_delta, is_default)
select t.id, g.id, v.id,
  case when v.key in ('hard', 'flared', 'zip') then 300 else 0 end,
  v.key in ('round', 'full', 'soft', 'straight', 'buttons')
from public.dress_templates t
join public.option_groups g on g.key in ('neckline', 'sleeve', 'cuff', 'closure')
join public.option_values v on v.group_id = g.id
where t.slug in ('shalwar-kameez', 'kurti', 'long-dress');

-- Template keys match what fn_notify_order and fn_create_order_from_draft enqueue.
-- Placeholders like {{order_number}} map to keys in notification_outbox.payload.
insert into public.notification_templates (key, channel, subject, body) values
('order_placed',     'email',    'Order {{order_number}} placed',
 'Hi {{customer_name}}, we have received your order {{order_number}}. We will confirm your fabric next.'),
('order_cancelled',  'email',    'Order {{order_number}} cancelled',
 'Order {{order_number}} was cancelled. Reason: {{reason}}'),
('order_dispatched', 'email',    'Order {{order_number}} is on its way',
 'Your order {{order_number}} has been dispatched. Estimated delivery: {{est_delivery_date}}.'),
('order_dispatched', 'whatsapp', null,
 'MultiFe: your order {{order_number}} has been dispatched.'),
('order_delivered',  'email',    'Order {{order_number}} delivered',
 'Your order {{order_number}} has been delivered. Thank you for choosing MultiFe.'),
('order_delivered',  'whatsapp', null,
 'MultiFe: your order {{order_number}} has been delivered. Thank you!');
