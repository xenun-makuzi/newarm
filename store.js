import { supabase, configured } from './supabase-client.js';
import { addToCart } from './cart.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = t => String(t ?? '').split(/\n{2,}/).filter(p => p.trim()).map(p => `<p>${esc(p.trim())}</p>`).join('');
const STOCK = { in_stock: ['In stock', 'ok'], low_stock: ['Low stock', 'warn'], out_of_stock: ['Out of stock', 'out'], on_order: ['On order', 'warn'] };
let cur = 'USD';
const money = p => (p == null ? 'Contact us for price' : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(p));
const href = p => `product.html?slug=${encodeURIComponent(p.slug)}`;
const img = (path, alt) => (path ? `<img src="${esc(supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl)}" alt="${esc(alt)}" loading="lazy">` : '<div class="ph">Image coming soon</div>');
const stock = s => `<span class="stock ${STOCK[s][1]}">${STOCK[s][0]}</span>`;
const card = p => `<article class="card prod"><a class="pimg" href="${href(p)}" tabindex="-1" aria-hidden="true">${img(p.image_path, '')}</a><p class="muted">${esc([p.brand, p.caliber].filter(Boolean).join(', ') || ' ')}</p><h3><a href="${href(p)}">${esc(p.name)}</a></h3><p class="price">${money(p.price)}</p>${stock(p.stock_status)}</article>`;
const list = () => supabase.from('products').select('id,name,slug,brand,caliber,price,stock_status,image_path,category:categories(name,slug)').eq('status', 'published');

async function categories(el) {
  const { data } = await supabase.from('categories').select('name,slug,description').eq('status', 'published').order('display_order');
  el.innerHTML = data?.length ? data.map(c => `<a class="card cat" href="shop.html?category=${encodeURIComponent(c.slug)}"><h3>${esc(c.name)}</h3><p>${esc(c.description || 'Browse the range.')}</p></a>`).join('') : '<p class="muted">Categories will appear here once added.</p>';
}

async function featured(el) {
  const { data } = await list().eq('is_featured', true).order('created_at', { ascending: false }).limit(Number(el.dataset.limit) || 4);
  el.innerHTML = data?.length ? data.map(card).join('') : '<p class="muted">Featured products will appear here once added.</p>';
}

async function shop(el) {
  el.innerHTML = `<div class="filters"><label><span class="sr">Search</span><input id="q" type="search" placeholder="Search name, brand or calibre"></label><label><span class="sr">Sort</span><select id="sort"><option value="new">Newest first</option><option value="lo">Price: low to high</option><option value="hi">Price: high to low</option><option value="az">Name A to Z</option></select></label><label class="chk"><input id="stock" type="checkbox"> In stock only</label></div><div id="chips" class="chips"></div><p id="count" class="muted" role="status"></p><div id="grid" class="grid"></div><p><button id="more" class="btn dark" hidden>Show more</button></p>`;
  const [{ data: cats }, { data: all, error }] = await Promise.all([
    supabase.from('categories').select('name,slug').eq('status', 'published').order('display_order'),
    list().order('created_at', { ascending: false }).limit(500),
  ]);
  if (error) { $('#grid').innerHTML = '<p class="notice">The catalogue could not be loaded. Please try again later.</p>'; return; }
  const slug = new URLSearchParams(location.search).get('category') || '';
  let n = 12;
  const chip = (s, t) => `<a class="chip" href="${s ? '?category=' + encodeURIComponent(s) : 'shop.html'}" ${s === slug ? 'aria-current="true"' : ''}>${esc(t)}</a>`;
  $('#chips').innerHTML = chip('', 'All') + (cats || []).map(c => chip(c.slug, c.name)).join('');
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), sort = $('#sort').value;
    const L = all.filter(p => (!slug || p.category?.slug === slug) && (!$('#stock').checked || p.stock_status !== 'out_of_stock') && (!q || [p.name, p.brand, p.caliber].join(' ').toLowerCase().includes(q)));
    L.sort(sort === 'lo' ? (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12) : sort === 'hi' ? (a, b) => (b.price ?? -1) - (a.price ?? -1) : sort === 'az' ? (a, b) => a.name.localeCompare(b.name) : () => 0);
    $('#count').textContent = `${L.length} item${L.length === 1 ? '' : 's'}`;
    $('#grid').innerHTML = L.length ? L.slice(0, n).map(card).join('') : '<p class="muted">No items match. Try another category or search.</p>';
    $('#more').hidden = L.length <= n;
  };
  ['q', 'sort', 'stock'].forEach(i => $('#' + i).addEventListener('input', () => { n = 12; draw(); }));
  $('#more').onclick = () => { n += 12; draw(); };
  draw();
}

async function product(el) {
  const slug = new URLSearchParams(location.search).get('slug');
  const { data: p } = slug ? await supabase.from('products').select('*, category:categories(name,slug)').eq('slug', slug).eq('status', 'published').maybeSingle() : {};
  if (!p) { el.innerHTML = '<h1>Item not found</h1><p>This item is not listed. <a href="shop.html">Back to the shop</a>.</p>'; return; }
  document.title = `${p.name} | Liberty Arms`;
  const specs = (p.specs || '').split('\n').map(l => l.split(/:(.*)/s)).filter(a => a[1]?.trim()).map(a => `<tr><th scope="row">${esc(a[0].trim())}</th><td>${esc(a[1].trim())}</td></tr>`).join('');
  const { data: gx } = await supabase.from('product_images').select('image_path').eq('product_id', p.id).order('display_order').order('created_at');
  const imgs = [...new Set([p.image_path, ...(gx || []).map(g => g.image_path)].filter(Boolean))];
  const gal = `<div class="pimg big" id="main-img">${img(imgs[0], p.name)}</div>${imgs.length > 1 ? `<div class="thumbs">${imgs.map((x, i) => `<button type="button" data-i="${i}" aria-label="Show image ${i + 1}">${img(x, '')}</button>`).join('')}</div>` : ''}`;
  const buy = p.price != null && p.stock_status !== 'out_of_stock' ? `<p class="row"><label class="sr" for="qty">Quantity</label><select id="qty" style="width:auto">${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select><button type="button" id="add" class="btn dark">Add to cart</button></p><p id="cart-msg" role="status" class="muted"></p>` : '';
  const form = p.stock_status === 'out_of_stock'
    ? '<p class="notice">This item is currently unavailable. <a href="contact.html">Contact us</a> to ask about restocking.</p>'
    : `<form id="reserve-form" class="card" novalidate><h2>Reserve or enquire</h2>
<label for="r_name">Name</label><input id="r_name" name="name" autocomplete="name" required maxlength="100"><span class="err" data-err="name"></span>
<label for="r_email">Email</label><input id="r_email" name="email" type="email" autocomplete="email" required maxlength="254"><span class="err" data-err="email"></span>
<label for="r_phone">Phone (optional)</label><input id="r_phone" name="phone" type="tel" autocomplete="tel" maxlength="30">
<label for="r_msg">Message (optional)</label><textarea id="r_msg" name="message" rows="4" maxlength="1000"></textarea>
<label class="chk"><input type="checkbox" name="ack"> I am of legal age where I live and understand any sale or transfer is subject to eligibility checks.</label><span class="err" data-err="ack"></span>
<div class="hp" aria-hidden="true"><label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button class="btn dark" type="submit">Send request</button><p id="form-status" role="status"></p></form>`;
  el.innerHTML = `<p class="muted"><a href="shop.html">Shop</a>${p.category ? ` / <a href="shop.html?category=${encodeURIComponent(p.category.slug)}">${esc(p.category.name)}</a>` : ''}</p>
<div class="pd"><div>${gal}</div><div><h1>${esc(p.name)}</h1><p class="muted">${esc([p.brand, p.model, p.caliber, p.item_condition === 'used' ? 'Used' : 'New'].filter(Boolean).join(', '))}</p><p class="price big">${money(p.price)}</p>${stock(p.stock_status)}${buy}${paras(p.description)}${specs ? `<h2>Specifications</h2><table class="specs"><tbody>${specs}</tbody></table>` : ''}</div></div>
<div class="pd" style="margin-top:32px"><div>${form}</div><div><h2>Before you buy</h2><p>Availability and eligibility depend on the law where you live. Read our <a href="safety.html">safety and responsibility guide</a> and check our <a href="compliance.html">verified credentials</a>.</p></div></div>
<h2 style="margin-top:40px">More like this</h2><div class="grid" id="related"></div>`;
  let q = list().neq('id', p.id).limit(3); if (p.category_id) q = q.eq('category_id', p.category_id);
  const { data: rel } = await q;
  $('#related').innerHTML = rel?.length ? rel.map(card).join('') : '<p class="muted">More items will appear here.</p>';
  $('.thumbs')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) $('#main-img').innerHTML = img(imgs[Number(b.dataset.i)], p.name); });
  $('#add')?.addEventListener('click', () => { addToCart(p.id, Number($('#qty').value)); $('#cart-msg').innerHTML = 'Added to your cart. <a href="cart.html">View cart</a>'; });
  const f = $('#reserve-form'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)), errs = {}, st = $('#form-status');
    if ((d.name || '').trim().length < 2) errs.name = 'Enter your name.';
    if (!/^[^\s@]+@[^@\s]+\.[^\s@]{2,}$/.test((d.email || '').trim())) errs.email = 'Enter a valid email address.';
    if (!d.ack) errs.ack = 'Please confirm to continue.';
    $$('[data-err]', f).forEach(s => (s.textContent = errs[s.dataset.err] || ''));
    if (Object.keys(errs).length) return;
    const ok = () => { f.reset(); st.className = 'notice ok'; st.textContent = 'Request received. We will contact you to confirm availability.'; };
    if (d.website) return ok();
    const btn = $('button[type=submit]', f); btn.disabled = true; st.className = ''; st.textContent = 'Sending…';
    const { error } = await supabase.from('reservations').insert({ product_id: p.id, name: d.name.trim(), email: d.email.trim(), phone: (d.phone || '').trim() || null, message: (d.message || '').trim() || null, ack: true });
    btn.disabled = false;
    if (!error) return ok();
    st.className = 'notice';
    st.textContent = /too many/i.test(error.message) ? 'Too many requests. Please wait a few minutes and try again.' : 'Your request could not be sent. Please try again later.';
  });
}

async function init() {
  const roots = $$('[data-store]'); if (!roots.length) return;
  if (!configured) { $('#setup-notice')?.removeAttribute('hidden'); roots.forEach(el => (el.innerHTML = '<p class="muted">The store needs Supabase to be configured (see README).</p>')); return; }
  const { data: s } = await supabase.from('site_settings').select('setting_value').eq('setting_key', 'currency_code').maybeSingle();
  if (/^[A-Za-z]{3}$/.test(s?.setting_value || '')) cur = s.setting_value.toUpperCase();
  await Promise.all(roots.map(el => ({ categories, featured, shop, product }[el.dataset.store])(el)));
}
init();
