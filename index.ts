// Marks an APPROVED order as paid when a payment provider (or a small adapter in front of it) posts a signed payload.
// Deploy:  supabase functions deploy payment-webhook --no-verify-jwt
//          supabase secrets set PAYMENT_WEBHOOK_SECRET=<long random value>
// Request: POST {"order_id": "<uuid>", "reference": "<provider reference>", "amount": 123.45}
// Header:  x-signature = hex HMAC-SHA256 of the raw request body, keyed with PAYMENT_WEBHOOK_SECRET.
// The service-role key is read from the function's own environment and never reaches the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

Deno.serve(async req => {
  const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
  if (req.method !== 'POST' || !secret) return new Response('Not available', { status: 405 });
  const body = await req.text();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  if (!same(sig, req.headers.get('x-signature') ?? '')) return new Response('Invalid signature', { status: 401 });
  let p: { order_id?: string; reference?: string; amount?: number };
  try { p = JSON.parse(body); } catch { return new Response('Bad request', { status: 400 }); }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: o } = await db.from('orders').select('total,status,payment_status').eq('id', p.order_id).maybeSingle();
  if (!o || o.status !== 'approved' || o.payment_status === 'paid' || Number(p.amount) !== Number(o.total)) return new Response('Rejected', { status: 422 });
  const { error } = await db.from('orders').update({ status: 'paid', payment_status: 'paid', payment_reference: String(p.reference ?? '').slice(0, 100) }).eq('id', p.order_id).eq('status', 'approved');
  return new Response(error ? 'Failed' : 'ok', { status: error ? 500 : 200 });
});
