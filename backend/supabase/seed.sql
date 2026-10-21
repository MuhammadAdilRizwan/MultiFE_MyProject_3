-- MultiFe — starter reference data. Run after the migration.
-- Measurement ranges are placeholders in cm; adjust with the client's tailors.

insert into public.measurement_templates (name, fields) values
('Shalwar Kameez', '[
  {"key":"height",         "label":"Height",          "unit":"cm", "min":120, "max":220},
  {"key":"neck",           "label":"Neck",            "unit":"cm", "min":28,  "max":55},
  {"key":"shoulder_width", "label":"Shoulder width",  "unit":"cm", "min":30,  "max":65},
  {"key":"chest",          "label":"Chest",           "unit":"cm", "min":60,  "max":160},
  {"key":"waist",          "label":"Waist",           "unit":"cm", "min":50,  "max":160},
  {"key":"hip",            "label":"Hip",             "unit":"cm", "min":60,  "max":170},
  {"key":"sleeve",         "label":"Sleeve length",   "unit":"cm", "min":40,  "max":80},
  {"key":"kameez_length",  "label":"Kameez length",   "unit":"cm", "min":60,  "max":130},
  {"key":"shalwar_length", "label":"Shalwar length",  "unit":"cm", "min":70,  "max":120}
]'::jsonb),
('Shirt', '[
  {"key":"neck",           "label":"Neck",            "unit":"cm", "min":28,  "max":55},
  {"key":"shoulder_width", "label":"Shoulder width",  "unit":"cm", "min":30,  "max":65},
  {"key":"chest",          "label":"Chest",           "unit":"cm", "min":60,  "max":160},
  {"key":"waist",          "label":"Waist",           "unit":"cm", "min":50,  "max":160},
  {"key":"sleeve",         "label":"Sleeve length",   "unit":"cm", "min":40,  "max":80},
  {"key":"back_length",    "label":"Back length",     "unit":"cm", "min":55,  "max":100}
]'::jsonb),
('Trousers', '[
  {"key":"waist",          "label":"Waist",           "unit":"cm", "min":50,  "max":160},
  {"key":"hip",            "label":"Hip",             "unit":"cm", "min":60,  "max":170},
  {"key":"inseam",         "label":"Inseam",          "unit":"cm", "min":55,  "max":100},
  {"key":"outseam",        "label":"Outseam",         "unit":"cm", "min":80,  "max":125}
]'::jsonb);

insert into public.categories (name, measurement_template_id, sort)
select c.name, t.id, c.sort
from (values
  ('Shalwar Kameez', 'Shalwar Kameez', 1),
  ('Kurta',          'Shirt',          2),
  ('Shirts',         'Shirt',          3),
  ('Trousers',       'Trousers',       4)
) as c(name, template, sort)
join public.measurement_templates t on t.name = c.template;

-- Template keys match the ones enqueued by fn_place_order / fn_transition_order.
-- Placeholders like {{order_number}} map to keys in notification_outbox.payload.
insert into public.notification_templates (key, channel, subject, body) values
('order_placed',         'email',    'Order {{order_number}} placed',
 'Hi {{customer_name}}, {{shop_name}} has received your order {{order_number}}. They will check your measurements next.'),
('order_rejected',       'email',    'Order {{order_number}} was not accepted',
 'Sorry, {{shop_name}} could not accept order {{order_number}}. Reason: {{reason}}'),
('order_confirmed',      'email',    'Order {{order_number}} confirmed',
 '{{shop_name}} confirmed your order {{order_number}}. Estimated ready date: {{est_ready_date}}.'),
('order_confirmed',      'whatsapp', null,
 '{{shop_name}}: your order {{order_number}} is confirmed. Ready by {{est_ready_date}}.'),
('order_ready',          'email',    'Order {{order_number}} is ready',
 'Your order {{order_number}} from {{shop_name}} is ready.'),
('order_ready',          'whatsapp', null,
 '{{shop_name}}: your order {{order_number}} is ready.'),
('order_completed',      'whatsapp', null,
 'Thank you! Order {{order_number}} from {{shop_name}} is complete.'),
('order_cancelled',      'email',    'Order {{order_number}} cancelled',
 'Order {{order_number}} with {{shop_name}} was cancelled. Reason: {{reason}}'),
('order_cancelled_shop', 'email',    'Order {{order_number}} cancelled',
 'Order {{order_number}} ({{customer_name}}) was cancelled. {{reason}}');
