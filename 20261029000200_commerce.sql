-- Liberty Arms commerce: customer accounts, product galleries, delivery methods, orders. Run after the store migration.
alter table public.profiles
  add column full_name text check (char_length(full_name) <= 100),
  add column phone text check (char_length(phone) <= 30),
  add column address_line1 text check (char_length(address_line1) <= 150),
  add column city text check (char_length(city) <= 80),
  add column region text check (char_length(region) <= 80),
  add column postal_code text check (char_length(postal_code) <= 20),
  add column country text check (char_length(country) <= 80);

-- ship: may be delivered to the customer. licensed_transfer: only to a licensed dealer or in person. pickup_only: in person only.
alter table public.products add column fulfilment text not null default 'licensed_transfer' check (fulfilment in ('ship','licensed_transfer','pickup_only'));

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  image_path text not null check (image_path ~ '^[A-Za-z0-9_./-]{1,200}$'),
  alt_text text check (char_length(alt_text) <= 200),
  display_order int not null default 0,
  created_at timestamptz not null default now());
create index on public.product_images (product_id, display_order);

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 300),
  method_type text not null check (method_type in ('ship','licensed_transfer','pickup')),
  price numeric(12,2) not null default 0 check (price >= 0),
  display_order int not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  user_id uuid references auth.users on delete set null,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','paid','fulfilled','cancelled')),
  payment_method text not null check (payment_method in ('pay_on_collection','bank_transfer','payment_link')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded')),
  payment_reference text check (char_length(payment_reference) <= 100),
  currency text not null default 'USD',
  subtotal numeric(12,2) not null,
  shipping_cost numeric(12,2) not null,
  total numeric(12,2) not null,
  shipping_method_name text not null,
  method_type text not null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_email text not null check (char_length(customer_email) <= 254),
  customer_phone text check (char_length(customer_phone) <= 30),
  ship_to text check (char_length(ship_to) <= 400),
  transfer_dealer text check (char_length(transfer_dealer) <= 400),
  customer_notes text check (char_length(customer_notes) <= 1000),
  eligibility_ack boolean not null check (eligibility_ack),
  tracking_number text check (char_length(tracking_number) <= 100),
  internal_notes text check (char_length(internal_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index on public.orders (user_id, created_at desc);
create index on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  product_id uuid references public.products on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity int not null check (quantity between 1 and 10));
create index on public.order_items (order_id);

-- The ONLY way to create an order. Prices, stock and fulfilment rules are read from the database, never from the browser.
create function public.place_order(p_items jsonb, p_method uuid, p_payment text, p_details jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.shipping_methods; p public.products;
  it jsonb; q int; sub numeric := 0; need int := 0; oid uuid;
  nm text := trim(coalesce(p_details ->> 'name', ''));
  cur text := coalesce((select setting_value from public.site_settings where setting_key = 'currency_code'), 'USD');
begin
  if uid is null then raise exception 'Sign in to place an order.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Your cart is empty or too large.'; end if;
  if (select count(*) from public.orders where user_id = uid and created_at > now() - interval '1 hour') >= 5 then raise exception 'Too many orders. Please try again later.'; end if;
  select * into m from public.shipping_methods where id = p_method and status = 'published';
  if not found then raise exception 'Choose a delivery method.'; end if;
  if p_payment not in ('pay_on_collection','bank_transfer','payment_link') then raise exception 'Choose a payment method.'; end if;
  if coalesce(p_details ->> 'ack', '') <> 'true' then raise exception 'Please confirm the eligibility statement.'; end if;
  if char_length(nm) < 2 then raise exception 'Enter your name.'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    q := (it ->> 'qty')::int;
    if q is null or q not between 1 and 10 then raise exception 'Invalid quantity.'; end if;
    select * into p from public.products where id = (it ->> 'id')::uuid and status = 'published';
    if not found or p.price is null or p.stock_status = 'out_of_stock' then raise exception 'An item in your cart is unavailable.'; end if;
    need := greatest(need, case p.fulfilment when 'ship' then 0 when 'licensed_transfer' then 1 else 2 end);
    sub := sub + p.price * q;
  end loop;
  if (need = 2 and m.method_type <> 'pickup') or (need = 1 and m.method_type = 'ship') then raise exception 'That delivery method is not available for the items in your cart.'; end if;
  if m.method_type = 'ship' and char_length(trim(coalesce(p_details ->> 'ship_to', ''))) < 10 then raise exception 'Enter a delivery address.'; end if;
  if m.method_type = 'licensed_transfer' and char_length(trim(coalesce(p_details ->> 'dealer', ''))) < 10 then raise exception 'Enter the receiving dealer details.'; end if;
  insert into public.orders (user_id, payment_method, currency, subtotal, shipping_cost, total, shipping_method_name, method_type, customer_name, customer_email, customer_phone, ship_to, transfer_dealer, customer_notes, eligibility_ack)
  values (uid, p_payment, cur, sub, m.price, sub + m.price, m.name, m.method_type, left(nm, 100),
    (select email from auth.users where id = uid), left(nullif(trim(p_details ->> 'phone'), ''), 30),
    case when m.method_type = 'ship' then left(trim(p_details ->> 'ship_to'), 400) end,
    case when m.method_type = 'licensed_transfer' then left(trim(p_details ->> 'dealer'), 400) end,
    left(nullif(trim(p_details ->> 'notes'), ''), 1000), true)
  returning id into oid;
  for it in select value from jsonb_array_elements(p_items) loop
    select * into p from public.products where id = (it ->> 'id')::uuid;
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (oid, p.id, p.name, p.price, (it ->> 'qty')::int);
  end loop;
  return oid;
end $$;
revoke all on function public.place_order(jsonb, uuid, text, jsonb) from public, anon;
grant execute on function public.place_order(jsonb, uuid, text, jsonb) to authenticated;

do $$ declare t text; begin
  foreach t in array array['product_images','shipping_methods','orders','order_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['shipping_methods','orders'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()', t);
  end loop;
end $$;

create policy "public read" on public.shipping_methods for select to anon, authenticated using (status = 'published');
create policy "public read" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
-- Customers read only their own orders. There is no customer insert/update policy: orders are created by place_order() only.
create policy "own orders" on public.orders for select to authenticated using (user_id = (select auth.uid()));
create policy "own order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
revoke all on public.orders, public.order_items from anon;
revoke truncate, references, trigger on public.product_images, public.shipping_methods, public.orders, public.order_items from anon, authenticated;

insert into public.shipping_methods (name, description, method_type, price, display_order, status) values
  ('Store pickup', 'Collect in person after eligibility checks.', 'pickup', 0, 1, 'published'),
  ('Licensed dealer transfer', 'Delivered to a licensed dealer you nominate. Set the fee, then publish.', 'licensed_transfer', 0, 2, 'draft'),
  ('Standard shipping', 'For items that may lawfully be shipped to the customer. Set the fee, then publish.', 'ship', 0, 3, 'draft');
insert into public.site_settings (setting_key, setting_value) values ('payment_instructions', '') on conflict (setting_key) do nothing;
