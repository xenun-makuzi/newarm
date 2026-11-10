import { supabase, configured } from '../assets/js/supabase-client.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = n => n.replace(/_id$/, '').replace(/_/g, ' ');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const toast = (t, bad) => { const el = $('#toast'); el.textContent = t; el.style.background = bad ? '#9b1c1c' : ''; el.style.display = 'block'; setTimeout(() => (el.style.display = 'none'), 4500); };
const bye = () => location.replace('login.html');
const isAdmin = async u => !!(await supabase.from('user_roles').select('role').eq('user_id', u.id).eq('role', 'admin').maybeSingle()).data;

// Resource config: t=title, l=list columns, o=[order column, ascending], req=required, nn=no "New", f=[name,type,options]
const RES = {
  orders: { t: 'Orders', l: 'order_number,customer_name,total,status,payment_status', o: ['created_at', false], nn: 1, show: ['order_number', 'customer_name', 'customer_email', 'customer_phone', 'shipping_method_name', 'ship_to', 'transfer_dealer', 'customer_notes', 'subtotal', 'shipping_cost', 'total', 'currency', 'payment_method'], f: [['status', 'select', ['pending_review', 'approved', 'rejected', 'paid', 'fulfilled', 'cancelled']], ['payment_status', 'select', ['unpaid', 'pending', 'paid', 'refunded']], ['payment_reference', 'text'], ['tracking_number', 'text'], ['internal_notes', 'textarea']] },
  shipping_methods: { t: 'Delivery methods', l: 'name,method_type,price,status', o: ['display_order', true], req: ['name'], f: [['name', 'text'], ['description', 'textarea'], ['method_type', 'select', ['pickup', 'licensed_transfer', 'ship']], ['price', 'number'], ['display_order', 'number'], ['status', 'select', ['draft', 'published']]] },
  products: { t: 'Products', l: 'name,status,price,stock_status', o: ['created_at', false], req: ['name'], f: [['name', 'text'], ['slug', 'text'], ['category_id', 'ref'], ['brand', 'text'], ['model', 'text'], ['caliber', 'text'], ['item_condition', 'select', ['new', 'used']], ['price', 'number'], ['stock_status', 'select', ['in_stock', 'low_stock', 'out_of_stock', 'on_order']], ['fulfilment', 'select', ['licensed_transfer', 'ship', 'pickup_only']], ['is_featured', 'checkbox'], ['image_path', 'image'], ['description', 'textarea'], ['specs', 'textarea'], ['status', 'select', ['draft', 'published']]] },
  categories: { t: 'Categories', l: 'name,status,display_order', o: ['display_order', true], req: ['name'], f: [['name', 'text'], ['slug', 'text'], ['description', 'textarea'], ['display_order', 'number'], ['status', 'select', ['draft', 'published']]] },
  reservations: { t: 'Reservations', l: 'product_name,name,status,created_at', o: ['created_at', false], nn: 1, show: ['product_name', 'name', 'email', 'phone', 'message'], f: [['status', 'select', ['new', 'contacted', 'confirmed', 'completed', 'cancelled']], ['internal_notes', 'textarea']] },
  announcements: { t: 'Announcements', l: 'title,status,published_at', o: ['created_at', false], req: ['title', 'slug', 'body'], f: [['title', 'text'], ['slug', 'text'], ['excerpt', 'textarea'], ['body', 'textarea'], ['status', 'select', ['draft', 'published', 'archived']], ['published_at', 'datetime-local']] },
  faqs: { t: 'FAQs', l: 'question,status,display_order', o: ['display_order', true], req: ['question', 'answer'], f: [['question', 'text'], ['answer', 'textarea'], ['display_order', 'number'], ['status', 'select', ['draft', 'published']]] },
  compliance_records: { t: 'Compliance', l: 'title,verification_status,expiry_date', o: ['created_at', false], req: ['title', 'document_type'], f: [['title', 'text'], ['document_type', 'text'], ['issuing_authority', 'text'], ['public_reference', 'text'], ['issue_date', 'date'], ['expiry_date', 'date'], ['verification_status', 'select', ['draft', 'pending_review', 'verified', 'expired', 'rejected']], ['public_summary', 'textarea'], ['internal_notes', 'textarea'], ['private_storage_path', 'text']] },
  contact_messages: { t: 'Enquiries', l: 'subject,name,status,created_at', o: ['created_at', false], nn: 1, show: ['name', 'email', 'subject', 'message'], f: [['status', 'select', ['unread', 'read', 'in_progress', 'resolved', 'archived']], ['internal_notes', 'textarea']] },
  pages: { t: 'Pages', l: 'slug,title,status', o: ['slug', true], req: ['title'], f: [['slug', 'select', ['home', 'about', 'compliance', 'safety', 'privacy', 'terms']], ['title', 'text'], ['content', 'textarea'], ['status', 'select', ['draft', 'published']], ['published_at', 'datetime-local']] },
  site_settings: { t: 'Settings', l: 'setting_key,setting_value', o: ['setting_key', true], req: ['setting_key'], f: [['setting_key', 'text'], ['setting_value', 'textarea']] },
};
const view = $('#view');
const pub = p => supabase.storage.from('public-media').getPublicUrl(p).data.publicUrl;
const SEARCH = { products: ['name', 'brand', 'caliber'], categories: ['name'], orders: ['customer_name', 'customer_email'], shipping_methods: ['name'], reservations: ['name', 'email', 'product_name'], contact_messages: ['name', 'email', 'subject'], announcements: ['title'], faqs: ['question'], compliance_records: ['title', 'document_type'], pages: ['title'], site_settings: ['setting_key'] };
let flt = { q: '', st: '' };

async function overview() {
  const c = (t, f = q => q) => f(supabase.from(t).select('*', { count: 'exact', head: true })).then(r => r.count ?? 0);
  const [pub, dr, pend, all, unread, prods, newRes, ords] = await Promise.all([
    c('announcements', q => q.eq('status', 'published')), c('announcements', q => q.eq('status', 'draft')),
    c('compliance_records', q => q.eq('verification_status', 'pending_review')),
    c('contact_messages'), c('contact_messages', q => q.eq('status', 'unread')),
    c('products', q => q.eq('status', 'published')), c('reservations', q => q.eq('status', 'new')), c('orders', q => q.eq('status', 'pending_review')),
  ]);
  const cards = [['Published announcements', pub], ['Draft announcements', dr], ['Pending document reviews', pend], ['Total enquiries', all], ['Unread enquiries', unread], ['Published products', prods], ['New reservations', newRes], ['Orders awaiting review', ords]];
  view.innerHTML = `<h1>Overview</h1><div class="stats">${cards.map(([l, n]) => `<div class="card stat"><b>${n}</b>${l}</div>`).join('')}</div>` +
    (pub + dr + pend + all + prods + newRes + ords ? '' : '<p class="muted">No records yet. Choose a section in the menu to add content.</p>');
}

async function list(k, pg = 0) {
  const r = RES[k], cols = r.l.split(','), SZ = 15, stf = r.f.find(x => x[0] === 'status');
  let qb = supabase.from(k).select('id,' + r.l, { count: 'exact' });
  const q = flt.q.replace(/[%,()*:"\\]/g, ' ').trim();
  if (q && SEARCH[k]) qb = qb.or(SEARCH[k].map(c => `${c}.ilike.%${q}%`).join(','));
  if (flt.st && stf) qb = qb.eq('status', flt.st);
  const { data, count, error } = await qb.order(r.o[0], { ascending: r.o[1] }).range(pg * SZ, pg * SZ + SZ - 1);
  if (error) { view.innerHTML = `<p class="notice">Could not load records: ${esc(error.message)}</p>`; return; }
  const pages = Math.max(1, Math.ceil((count || 0) / SZ));
  view.innerHTML = `<div class="row" style="justify-content:space-between"><h1>${r.t}</h1>${r.nn ? '' : '<button class="btn dark" data-new>New</button>'}</div>` +
    `<form id="flt" class="row" style="margin-bottom:12px"><input name="q" type="search" placeholder="Search" aria-label="Search" value="${esc(flt.q)}" style="width:auto">${stf ? `<select name="st" aria-label="Status" style="width:auto"><option value="">All statuses</option>${stf[2].map(s => `<option ${s === flt.st ? 'selected' : ''}>${s}</option>`).join('')}</select>` : ''}<button class="btn dark" type="submit">Search</button></form>` +
    (data.length ? `<table><thead><tr>${cols.map(c => `<th>${label(c)}</th>`).join('')}<th></th></tr></thead><tbody>${data.map(x => `<tr>${cols.map(c => `<td>${esc(x[c])}</td>`).join('')}<td class="row"><button class="btn dark" data-edit="${esc(x.id)}">Edit</button><button class="btn sec" data-del="${esc(x.id)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing found.</p>') +
    `<p class="row"><button class="btn sec" data-page="${pg - 1}" ${pg ? '' : 'disabled'}>Previous</button><span>Page ${pg + 1} of ${pages} (${count || 0} records)</span><button class="btn sec" data-page="${pg + 1}" ${pg + 1 < pages ? '' : 'disabled'}>Next</button></p>`;
}

async function edit(k, id) {
  const r = RES[k]; let row = {};
  if (id) { const { data, error } = await supabase.from(k).select('*').eq('id', id).single(); if (error) return toast(error.message, 1); row = data; }
  const cats = k === 'products' ? ((await supabase.from('categories').select('id,name').order('display_order')).data || []).map(c => [c.id, c.name]) : [];
  const items = k === 'orders' && id ? (await supabase.from('order_items').select('product_name,quantity,unit_price').eq('order_id', id)).data || [] : [];
  const imgs = k === 'products' && id ? (await supabase.from('product_images').select('id,image_path').eq('product_id', id).order('display_order').order('created_at')).data || [] : [];
  const gallery = k === 'products' && id ? `<div class="card" style="margin-top:20px"><h2>Gallery images</h2><div class="row">${imgs.map(g => `<figure style="margin:0"><img src="${esc(pub(g.image_path))}" alt="" width="96" height="72" style="object-fit:cover;display:block"><button type="button" class="btn sec" data-delimg="${esc(g.id)}" data-path="${esc(g.image_path)}" data-pid="${esc(id)}">Remove</button></figure>`).join('') || '<p class="muted">No extra images yet.</p>'}</div><label for="gal">Add images</label><input id="gal" type="file" multiple accept="image/png,image/jpeg,image/webp"><p><button type="button" class="btn dark" data-addimgs="${esc(id)}">Upload images</button></p></div>` : '';
  const field = ([n, t, o]) => {
    const v = row[n] ?? '', req = r.req?.includes(n) ? 'required' : '';
    const lab = `<label for="f_${n}">${label(n)}${t === 'datetime-local' ? ' (UTC)' : ''}</label>`;
    if (t === 'checkbox') return `<label class="chk"><input id="f_${n}" name="${n}" type="checkbox" ${v ? 'checked' : ''}> ${label(n)}</label>`;
    if (t === 'image') return `${lab}${v ? `<p class="muted">Current file: ${esc(v)}</p>` : ''}<input id="f_${n}" name="${n}" type="file" accept="image/png,image/jpeg,image/webp"><span class="muted">PNG, JPEG or WebP, up to 5 MB. Leave empty to keep the current image.</span>`;
    if (t === 'textarea') return `${lab}<textarea id="f_${n}" name="${n}" rows="6" ${req}>${esc(v)}</textarea>${n === 'specs' ? '<span class="muted">One per line, for example: Barrel length: 4 in</span>' : ''}`;
    if (t === 'select' || t === 'ref') {
      const opts = (t === 'ref' ? [['', 'None'], ...cats] : o).map(x => (Array.isArray(x) ? x : [x, x]));
      return `${lab}<select id="f_${n}" name="${n}">${opts.map(([a, b]) => `<option value="${esc(a)}" ${a === v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
    }
    return `${lab}<input id="f_${n}" name="${n}" type="${t}" ${t === 'number' ? 'step="any"' : ''} value="${esc(t === 'datetime-local' ? String(v).slice(0, 16) : v)}" ${req}>`;
  };
  view.innerHTML = `<h1>${id ? 'Edit' : 'New'} ${r.t}</h1>` +
    (r.show || []).map(n => `<p><b>${label(n)}:</b> <span style="white-space:pre-wrap">${esc(row[n])}</span></p>`).join('') +
    (items.length ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.product_name)}</td><td>${i.quantity}</td><td>${esc(i.unit_price)}</td></tr>`).join('')}</tbody></table>` : '') +
    `<form id="rec" class="card">${r.f.map(field).join('')}<p class="row"><button class="btn dark" type="submit">Save changes</button><button type="button" class="btn sec" data-cancel>Cancel</button></p></form>` + gallery;
  $('#rec').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter, out = {}; btn.disabled = true;
    const fail = m => { btn.disabled = false; toast(m, 1); };
    for (const [n, t] of r.f) {
      const el = e.target.elements[n]; let v;
      if (t === 'checkbox') v = el.checked;
      else if (t === 'image') {
        const file = el.files[0]; if (!file) continue;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5242880) return fail('Choose a PNG, JPEG or WebP image under 5 MB.');
        const path = `${k}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
        const up = await supabase.storage.from('public-media').upload(path, file, { contentType: file.type });
        if (up.error) return fail(up.error.message);
        v = path;
      } else {
        v = el.value.trim();
        if (t === 'datetime-local') v = v ? new Date(v + 'Z').toISOString() : null;
        else if (t === 'number') v = v === '' ? null : Number(v);
        else if (v === '' && !['content', 'setting_value'].includes(n)) v = null;
      }
      out[n] = v;
    }
    if (r.f.some(x => x[0] === 'slug' && x[1] === 'text') && !out.slug) out.slug = slugify(out.name || out.title || '');
    if (k === 'contact_messages') out.archived_at = out.status === 'archived' ? new Date().toISOString() : null;
    if (!id) for (const n in out) if (out[n] === null) delete out[n];
    const { error } = await (id ? supabase.from(k).update(out).eq('id', id) : supabase.from(k).insert(out));
    if (error) return fail(error.message);
    toast('Changes saved'); show(k);
  };
}

function show(k) {
  document.querySelectorAll('#menu button').forEach(b => b.toggleAttribute('aria-current', b.dataset.v === k));
  view.innerHTML = 'Loading…'; flt = { q: '', st: '' };
  return k === 'overview' ? overview() : list(k);
}

async function addImgs(id) {
  const files = [...($('#gal').files || [])];
  if (!files.length) return toast('Choose one or more images first.', 1);
  if (files.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 5242880)) return toast('Use PNG, JPEG or WebP images under 5 MB.', 1);
  for (const f of files) {
    const path = `products/${crypto.randomUUID()}.${f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const up = await supabase.storage.from('public-media').upload(path, f, { contentType: f.type });
    if (up.error) return toast(up.error.message, 1);
    const { error } = await supabase.from('product_images').insert({ product_id: id, image_path: path });
    if (error) return toast(error.message, 1);
  }
  toast('Images uploaded'); edit('products', id);
}
async function delImg(imgId, path, pid) {
  if (!confirm('Remove this image?')) return;
  const { error } = await supabase.from('product_images').delete().eq('id', imgId);
  if (error) return toast(error.message, 1);
  await supabase.storage.from('public-media').remove([path]);
  toast('Image removed'); edit('products', pid);
}

async function dashboard() {
  if (!configured) { view.innerHTML = '<p class="notice">Supabase is not configured. See the README.</p>'; return; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return bye();
  if (!(await isAdmin(session.user))) { await supabase.auth.signOut(); return bye(); }
  supabase.auth.onAuthStateChange(ev => ev === 'SIGNED_OUT' && bye()); // also fires when a session expires
  $('#who').textContent = session.user.email;
  $('#signout').onclick = () => supabase.auth.signOut();
  $('#menu').innerHTML = [['overview', 'Overview'], ...Object.entries(RES).map(([k, r]) => [k, r.t])].map(([k, t]) => `<button data-v="${k}">${t}</button>`).join('');
  let cur = 'overview';
  document.addEventListener('submit', e => {
    if (e.target.id !== 'flt') return;
    e.preventDefault(); const d = new FormData(e.target);
    flt = { q: (d.get('q') || '').trim(), st: d.get('st') || '' }; list(cur, 0);
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.v) show((cur = d.v));
    else if (d.new !== undefined) edit(cur);
    else if (d.edit) edit(cur, d.edit);
    else if (d.cancel !== undefined) show(cur);
    else if (d.page !== undefined) list(cur, Number(d.page));
    else if (d.addimgs) addImgs(d.addimgs);
    else if (d.delimg) delImg(d.delimg, d.path, d.pid);
    else if (d.del && confirm('Delete this record permanently? This cannot be undone.')) {
      const { error } = await supabase.from(cur).delete().eq('id', d.del);
      error ? toast(error.message, 1) : (toast('Record deleted'), show(cur));
    }
  });
  show('overview');
}

const login = $('#login-form');
if (!configured && login) $('#login-notice').hidden = false;
else if (login) {
  login.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('#login-status'); st.textContent = 'Signing in…';
    const { data, error } = await supabase.auth.signInWithPassword({ email: login.elements.email.value.trim(), password: login.elements.password.value });
    if (error) { st.textContent = 'Sign-in failed. Check your email and password.'; return; }
    if (!(await isAdmin(data.user))) { await supabase.auth.signOut(); st.textContent = 'This account is not authorised for administration.'; return; }
    location.href = 'index.html';
  });
} else dashboard();
