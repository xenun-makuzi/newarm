# Liberty Arms website

Static site (HTML, CSS, vanilla JS ES modules) with a Supabase backend: Auth, Postgres with RLS, and Storage. No build step.

**Status:** written but not yet run against a live Supabase project. Follow the checks in step 7 before relying on it.

## 1. Requirements
A Supabase account, any static file server (`npx serve .` or `python3 -m http.server`; ES modules do not work from `file://`), and optionally the [Supabase CLI](https://supabase.com/docs/guides/cli) and Git.

## 2. Get the project
Unzip it, `cd liberty-arms`, `git init`, then serve the folder and open `http://localhost:3000` (or your server's port).

## 3. Create a Supabase project
Create a project at supabase.com. Leave **Allow new users to sign up** on and keep email confirmation on: customers register on the site, and admin rights come only from the `user_roles` table.

## 4. Configure
Put the project URL and the **publishable** key (Project Settings > API) in `assets/js/config.js`. Never use a service-role/secret key in this project. If config is missing the site shows a setup notice and built-in content.

## 5. Run migrations
CLI: `supabase link --project-ref <ref>` then `supabase db push`. Or paste each file in `supabase/migrations/` into the SQL editor, in order. Optionally run `supabase/seed.sql`.

## 6. Create the first administrator
1. Dashboard > Authentication > Users > **Add user** (set a strong password, auto-confirm).
2. In the SQL editor (not through the API) run:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```
There is no default admin and no API path to grant roles. Sign in at `/admin/login.html`.

## 7. Verify RLS
```sql
begin; set local role anon;
select count(*) from public.contact_messages;          -- expect: permission denied
select * from public.compliance_records;               -- expect: permission denied
select count(*) from public.public_compliance_records; -- allowed (verified, unexpired only)
select count(*) from public.faqs;                      -- published rows only
rollback;
```
Repeat as a non-admin signed-in user (they should see no enquiries, audit rows or compliance rows) and as an admin (full access). Submit the contact form 4 times quickly: the 4th should be refused.

## 8. Test the site
Public: each page loads with an empty database; publish an FAQ, announcement and a verified compliance record (with a public summary) and confirm they appear; draft/pending ones must not. Admin: sign in/out, edit each section, delete with confirmation, open an enquiry and change its status.

Useful `site_settings` keys: `business_name`, `contact_email`, `contact_phone`, `address`, `business_hours`, `footer_text`. Page content (Pages section) accepts plain text; blank lines make paragraphs. HTML is escaped.

## 9. Deploy
Upload the folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, Vercel). `/admin/` is protected by Auth plus RLS, not by hiding the URL.

## 10. Production domain
Point your domain at the host, then set Supabase **Authentication > URL Configuration** to that site URL. Replace `www.example.com` in `robots.txt` and `sitemap.xml`.

## 11. Backups and documents
Enable Supabase backups for your plan or run `supabase db dump`. Storage files are not included in database dumps; download them separately. `private-documents` is a private bucket for admins only; share files with short-lived signed URLs (for example 60 seconds), never public links. Names should be random (`crypto.randomUUID()`).

## 12. Common problems
- **Setup notice shown:** `config.js` still has placeholders.
- **Blank page / import errors:** serve over http, not `file://`.
- **"Not authorised" at sign-in:** the user has no row in `user_roles`.
- **Empty lists although data exists:** status is not `published`, `published_at` is in the future, or a compliance record is not `verified` with a public summary.
- **"Too many submissions":** the per-address limit (3 per 10 minutes) triggered.

## Not included / needs your input
- Upload UI for private compliance documents (the compliance form takes a storage path as text) and content preview.
- A payment provider (see the payments notes above), customer self-service cancellation, and order emails. Staff contact customers.
- CAPTCHA: a honeypot and the database rate limit are in place; stronger protection (for example Cloudflare Turnstile verified in an Edge Function) needs server-side code.
- Real company facts, credentials, and jurisdiction-specific safety links. None are invented.
- Privacy and Terms are drafts requiring legal review.
- `public_compliance_records` is a view that runs with owner rights by design; Supabase's linter may flag it.

## Store (shop, categories, product pages)
- Run both migrations (`..._initial_schema.sql`, then `..._store.sql`). The second creates `categories`, `products` and `reservations` with RLS and six starter categories.
- Optional: run `supabase/seed_demo.sql` to preview the shop with clearly labelled demo products. Delete them in Admin > Products before launch.
- Admin > Categories and Products: add items, upload images (public `public-media` bucket, random file names), tick Featured, and set status to Published to show them. Specs are one `Label: value` per line.
- Visitors reserve or enquire from a product page; nothing is paid online. Requests appear in Admin > Reservations and cannot be read by visitors.
- Currency is the `currency_code` setting (default USD).
- Verify as anon: `select count(*) from public.reservations;` must be permission denied, and draft products must not appear in the shop.

## Accounts, cart, orders and payments
- Run all three migrations in order. Then open Admin > Delivery methods: Store pickup is published; set fees and publish the other methods you offer.
- Customers register on `account.html`. Admin rights come only from `public.user_roles`, which cannot be changed through the API.
- The cart lives in the visitor's browser as a convenience only. At checkout the `place_order` database function re-reads prices and stock, enforces each product's fulfilment rule (`licensed_transfer` by default, `ship`, or `pickup_only`) and rate-limits orders. Browser prices are never trusted.
- Orders start as "pending review". Review eligibility in Admin > Orders and set the status to Approved. Then collect payment: on collection, bank transfer (text from the `payment_instructions` setting) or a payment link you email. Set Paid and add tracking when done.
- No payment provider is built in, and many processors do not allow firearms sales, so confirm yours does. To mark orders paid automatically, deploy `supabase/functions/payment-webhook` (`supabase functions deploy payment-webhook --no-verify-jwt`, then `supabase secrets set PAYMENT_WEBHOOK_SECRET=<long random value>`). It accepts a POST `{order_id, reference, amount}` with header `x-signature` set to the hex HMAC-SHA256 of the raw body, and only marks an approved order paid when the amount equals the order total. The secret and service-role key stay on the server.
- Extra product images: Admin > Products > edit a product > Gallery images. Admin lists have search, a status filter and 15-per-page pagination.
- Verify: as anon `select count(*) from public.orders;` must be permission denied; a signed-in customer sees only their own orders; `place_order` must refuse out-of-stock items and a `ship` method for a `licensed_transfer` product.
