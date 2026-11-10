-- Optional starter settings. Empty values make the site show its built-in fallback text.
insert into public.site_settings (setting_key, setting_value) values
  ('business_name', 'Liberty Arms'), ('contact_email', ''), ('contact_phone', ''),
  ('address', ''), ('business_hours', ''), ('footer_text', ''), ('currency_code', 'USD')
on conflict (setting_key) do nothing;
