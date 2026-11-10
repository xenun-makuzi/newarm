-- Liberty Arms initial schema, RLS and storage. Review before production use.
create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  unique (user_id, role));

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique check (setting_key ~ '^[a-z0-9_]{1,64}$'),
  setting_value text not null default '' check (char_length(setting_value) <= 5000),
  is_public boolean not null default true, -- public rows are readable by anyone: never store secrets here
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('home','about','compliance','safety','privacy','terms')),
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '' check (char_length(content) <= 50000),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt text check (char_length(excerpt) <= 500),
  body text not null check (char_length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz not null default now(), -- a future date schedules publication
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 3 and 300),
  answer text not null check (char_length(answer) <= 5000),
  display_order int not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null);

create table public.compliance_records (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  document_type text not null check (char_length(document_type) <= 100),
  issuing_authority text check (char_length(issuing_authority) <= 200),
  public_reference text check (char_length(public_reference) <= 100),
  issue_date date,
  expiry_date date,
  verification_status text not null default 'draft' check (verification_status in ('draft','pending_review','verified','expired','rejected')),
  verified_at timestamptz,
  public_summary text check (char_length(public_summary) <= 2000),
  internal_notes text check (char_length(internal_notes) <= 5000), -- admin-only
  private_storage_path text check (private_storage_path ~ '^[A-Za-z0-9_./-]{1,200}$'), -- admin-only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null,
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date));

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  subject text not null check (char_length(subject) between 3 and 150),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'unread' check (status in ('unread','read','in_progress','resolved','archived')),
  internal_notes text check (char_length(internal_notes) <= 5000),
  ip_hash text, -- sha-256 of the sender address, set by trigger, used only for rate limiting
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}');

create index on public.announcements (status, published_at desc);
create index on public.faqs (status, display_order);
create index on public.compliance_records (verification_status);
create index on public.contact_messages (status, created_at desc);
create index on public.contact_messages (ip_hash, created_at);
create index on public.admin_audit_log (created_at desc);

-- ---------- Functions ----------
-- Admin check: fixed search_path, not executable by anon. Roles can only be granted via SQL (see README).
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Sets updated_at/updated_by server-side so clients cannot spoof them.
create function public.touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new := jsonb_populate_record(new, jsonb_build_object('updated_at', now(), 'updated_by', auth.uid()));
  return new;
end $$;

create function public.stamp_verified() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.verification_status = 'verified' and (tg_op = 'INSERT' or old.verification_status <> 'verified') then new.verified_at := now(); end if;
  return new;
end $$;

create function public.audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.admin_audit_log (actor_user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), tg_op, tg_table_name, v ->> 'id',
    jsonb_build_object('status', coalesce(v ->> 'verification_status', v ->> 'status'), 'key', coalesce(v ->> 'setting_key', v ->> 'slug'), 'role', v ->> 'role'));
  return null;
end $$;

-- Spam control: at most 3 enquiries per sender address per 10 minutes.
create function public.contact_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare ip text := split_part(coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', 'unknown'), ',', 1);
begin
  new.ip_hash := encode(extensions.digest(ip, 'sha256'), 'hex');
  if (select count(*) from public.contact_messages where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Too many submissions. Please try again later.';
  end if;
  return new;
end $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger guard before insert on public.contact_messages for each row execute function public.contact_guard();
create trigger stamp before insert or update on public.compliance_records for each row execute function public.stamp_verified();

do $$ declare t text; begin
  foreach t in array array['profiles','site_settings','pages','announcements','faqs','compliance_records','contact_messages'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch()', t);
  end loop;
  foreach t in array array['site_settings','pages','announcements','faqs','compliance_records','user_roles'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()', t);
  end loop;
  foreach t in array array['profiles','user_roles','site_settings','pages','announcements','faqs','compliance_records','contact_messages','admin_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Administrators manage content; anonymous users get no policy here.
  foreach t in array array['site_settings','pages','announcements','faqs','compliance_records','contact_messages'] loop
    execute format('create policy "admin all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------- Row Level Security ----------
create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- user_roles: users may read their own role; there is NO write policy, so roles cannot be changed through the API.
create policy "own role read" on public.user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy "admin read audit" on public.admin_audit_log for select to authenticated using (public.is_admin());

create policy "public read" on public.site_settings for select to anon, authenticated using (is_public);
create policy "public read" on public.pages for select to anon, authenticated using (status = 'published');
create policy "public read" on public.announcements for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy "public read" on public.faqs for select to anon, authenticated using (status = 'published');
create policy "public submit" on public.contact_messages for insert to anon, authenticated
  with check (status = 'unread' and internal_notes is null and archived_at is null);

-- Defence in depth on table privileges.
revoke all on public.user_roles, public.admin_audit_log, public.compliance_records, public.profiles, public.contact_messages from anon;
grant insert on public.contact_messages to anon;
revoke insert, update, delete, truncate on public.user_roles, public.admin_audit_log from authenticated;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Public compliance data: ONLY verified, unexpired records with an approved summary, ONLY approved columns.
-- The view runs with its owner's rights on purpose (it is the sole public path to this table).
create view public.public_compliance_records as
  select id, title, document_type, issuing_authority, public_reference, issue_date, expiry_date, verified_at, public_summary
  from public.compliance_records
  where verification_status = 'verified' and coalesce(public_summary, '') <> '' and (expiry_date is null or expiry_date >= current_date);
grant select on public.public_compliance_records to anon, authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-media', 'public-media', true, 5242880, array['image/png','image/jpeg','image/webp']),
  ('private-documents', 'private-documents', false, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "admin manage public media" on storage.objects for all to authenticated
  using (bucket_id = 'public-media' and public.is_admin()) with check (bucket_id = 'public-media' and public.is_admin());
create policy "admin manage private documents" on storage.objects for all to authenticated
  using (bucket_id = 'private-documents' and public.is_admin()) with check (bucket_id = 'private-documents' and public.is_admin());
