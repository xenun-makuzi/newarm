-- OPTIONAL: clearly labelled demo products to preview the shop. Delete them in Admin > Products before launch.
insert into public.products (category_id, name, slug, brand, model, caliber, price, stock_status, is_featured, description, specs, status)
select c.id, v.name, v.slug, 'Demo Brand', v.model, nullif(v.cal, ''), v.price, 'in_stock', v.feat,
  'Demo listing for layout testing only. Delete before launch.', v.specs, 'published'
from (values
  ('handguns', 'Demo Compact Pistol (demo)', 'demo-compact-pistol', 'DC-9', '9mm', 549.00, true, E'Caliber: 9mm\nCapacity: 15 rounds\nBarrel length: 4 in\nFinish: Matte black'),
  ('handguns', 'Demo Revolver (demo)', 'demo-revolver', 'DR-38', '.38 Special', 479.00, false, E'Caliber: .38 Special\nCapacity: 6 rounds\nBarrel length: 3 in'),
  ('rifles', 'Demo Bolt-Action Rifle (demo)', 'demo-bolt-rifle', 'DB-308', '.308 Win', 899.00, true, E'Caliber: .308 Win\nCapacity: 5 rounds\nBarrel length: 22 in'),
  ('rifles', 'Demo Rimfire Rifle (demo)', 'demo-rimfire-rifle', 'DR-22', '.22 LR', 329.00, false, E'Caliber: .22 LR\nCapacity: 10 rounds\nBarrel length: 18 in'),
  ('shotguns', 'Demo Pump Shotgun (demo)', 'demo-pump-shotgun', 'DS-12', '12 gauge', 429.00, true, E'Gauge: 12\nCapacity: 5 rounds\nBarrel length: 28 in'),
  ('safes-storage', 'Demo Gun Safe (demo)', 'demo-gun-safe', 'DSF-10', '', 699.00, true, E'Capacity: 10 long guns\nLock: Electronic keypad')
) as v(cat, name, slug, model, cal, price, feat, specs)
join public.categories c on c.slug = v.cat
on conflict (slug) do nothing;
