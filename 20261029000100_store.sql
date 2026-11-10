-- Liberty Arms store: categories, products, reservations. Run after the initial schema.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 500),
  image_path text check (image_path ~ '^[A-Za-z0-9_./-]{1,200}$'),
  display_order int not null default 0,
  status text not null default 'published' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  brand text check (char_length(brand) <= 80),
  model text check (char_length(model) <= 80),
  caliber text check (char_length(caliber) <= 40),
  item_condition text not null default 'new' check (item_condition in ('new','used')),
  price numeric(12,2) check (price >= 0), -- null shows "Contact us for price"
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock','low_stock','out_of_stock','on_order')),
  is_featured boolean not null default false,
  image_path text check (image_path ~ '^[A-Za-z0-9_./-]{1,200}$'),
  description text check (char_length(description) <= 5000),
  specs text check (char_length(specs) <= 3000), -- one "Label: value" per line
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null);
create index on public.products (status, is_featured, created_at desc);
create index on public.products (category_id);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products on delete set null,
  product_name text,
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  phone text check (char_length(phone) <= 30),
  message text check (char_length(message) <= 1000),
  ack boolean not null check (ack), -- legal-age and eligibility acknowledgement
  status text not null default 'new' check (status in ('new','contacted','confirmed','completed','cancelled')),
  internal_notes text check (char_length(internal_notes) <= 5000),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index on public.reservations (status, created_at desc);
create index on public.reservations (ip_hash, created_at);

-- Spam control (3 per sender address per 10 minutes) and a product-name snapshot.
create function public.reservation_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare ip text := split_part(coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', 'unknown'), ',', 1);
begin
  new.ip_hash := encode(extensions.digest(ip, 'sha256'), 'hex');
  select name into new.product_name from public.products where id = new.product_id;
  if (select count(*) from public.reservations where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Too many submissions. Please try again later.';
  end if;
  return new;
end $$;
create trigger guard before insert on public.reservations for each row execute function public.reservation_guard();

do $$ declare t text; begin
  foreach t in array array['categories','products','reservations'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['categories','products'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (status = ''published'')', t);
  end loop;
end $$;

-- Visitors may only create a reservation for a published product; nobody but admins can read them.
create policy "public reserve" on public.reservations for insert to anon, authenticated
  with check (status = 'new' and internal_notes is null and exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
revoke all on public.reservations from anon;
grant insert on public.reservations to anon;
revoke truncate, references, trigger on public.categories, public.products, public.reservations from anon, authenticated;

insert into public.categories (name, slug, description, display_order) values
  ('Handguns', 'handguns', 'Pistols and revolvers.', 1),
  ('Rifles', 'rifles', 'Sporting and utility rifles.', 2),
  ('Shotguns', 'shotguns', 'Field and sport shotguns.', 3),
  ('Ammunition', 'ammunition', 'Factory ammunition by calibre.', 4),
  ('Optics and Accessories', 'optics-accessories', 'Sights, optics, cleaning kits and more.', 5),
  ('Safes and Storage', 'safes-storage', 'Secure storage and transport cases.', 6)
on conflict do nothing;
