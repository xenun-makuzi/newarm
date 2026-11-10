import { supabase, configured } from './supabase-client.js';
import './cart.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = t => String(t ?? '').split(/\n{2,}/).map(p => `<p>${esc(p.trim())}</p>`).join('');
const day = d => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'not set');

const toggle = $('.nav-toggle');
toggle?.addEventListener('click', () => toggle.setAttribute('aria-expanded', document.body.classList.toggle('nav-open')));

const sources = {
  announcements: () => supabase.from('announcements').select('title,excerpt,published_at').eq('status', 'published').lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }),
  faqs: () => supabase.from('faqs').select('question,answer').eq('status', 'published').order('display_order'),
  compliance: () => supabase.from('public_compliance_records').select('*').order('title'),
};
const views = {
  announcements: r => `<article class="card"><h3>${esc(r.title)}</h3><p class="muted">${day(r.published_at)}</p>${paras(r.excerpt)}</article>`,
  faqs: r => `<details><summary>${esc(r.question)}</summary>${paras(r.answer)}</details>`,
  compliance: r => `<article class="card cred"><span class="badge">Verified</span><h3>${esc(r.title)}</h3><p>${esc(r.document_type)}${r.issuing_authority ? ', issued by ' + esc(r.issuing_authority) : ''}${r.public_reference ? ' (ref. ' + esc(r.public_reference) + ')' : ''}</p>${paras(r.public_summary)}<p class="muted">Issued ${day(r.issue_date)}. Expires ${day(r.expiry_date)}.</p></article>`,
};
const empty = el => (el.innerHTML = `<p class="muted">${esc(el.dataset.empty || 'Nothing to show yet.')}</p>`);

async function init() {
  const lists = $$('[data-list]');
  if (!configured) { $('#setup-notice')?.removeAttribute('hidden'); lists.forEach(empty); return; }
  await Promise.all(lists.map(async el => {
    el.innerHTML = '<p class="muted">Loading…</p>';
    const { data, error } = await sources[el.dataset.list]().limit(Number(el.dataset.limit) || 50);
    if (error || !data?.length) return empty(el);
    el.innerHTML = data.map(views[el.dataset.list]).join('');
  }));
  const [{ data: st }, { data: pg }] = await Promise.all([
    supabase.from('site_settings').select('setting_key,setting_value'),
    supabase.from('pages').select('slug,content').eq('status', 'published'),
  ]);
  const S = Object.fromEntries((st || []).map(r => [r.setting_key, r.setting_value]));
  $$('[data-setting]').forEach(el => { if (S[el.dataset.setting]) el.textContent = S[el.dataset.setting]; });
  const P = Object.fromEntries((pg || []).map(r => [r.slug, r.content]));
  $$('[data-page]').forEach(el => { if (P[el.dataset.page]) el.innerHTML = paras(P[el.dataset.page]); });
}

const form = $('#contact-form');
form?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  const errs = {};
  for (const [k, [a, b]] of Object.entries({ name: [2, 100], subject: [3, 150], message: [10, 2000] })) {
    const n = (d[k] || '').trim().length;
    if (n < a || n > b) errs[k] = `Enter between ${a} and ${b} characters.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((d.email || '').trim()) || d.email.length > 254) errs.email = 'Enter a valid email address.';
  $$('[data-err]', form).forEach(s => (s.textContent = errs[s.dataset.err] || ''));
  const st = $('#form-status');
  if (Object.keys(errs).length) { st.className = ''; st.textContent = ''; return; }
  const ok = () => { form.reset(); st.className = 'notice ok'; st.textContent = 'Thank you. Your message has been received.'; };
  if (d.website) return ok(); // honeypot filled: drop silently
  if (!configured) { st.className = 'notice'; st.textContent = 'The form is not available until Supabase is configured.'; return; }
  const btn = $('button[type=submit]', form); btn.disabled = true; st.className = ''; st.textContent = 'Sending…';
  const { error } = await supabase.from('contact_messages').insert({ name: d.name.trim(), email: d.email.trim(), subject: d.subject.trim(), message: d.message.trim() });
  btn.disabled = false;
  if (!error) return ok();
  st.className = 'notice';
  st.textContent = /too many/i.test(error.message) ? 'Too many submissions. Please wait a few minutes and try again.' : 'Your message could not be sent. Please try again later.';
});

init();
