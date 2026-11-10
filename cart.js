const KEY = 'la_cart'; // convenience only: prices, stock and rules are re-checked on the server at checkout
const valid = i => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 10;
export const getCart = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(c) ? c.filter(valid) : []; } catch { return []; } };
export function count() {
  const n = getCart().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('[data-cart-count]').forEach(el => (el.textContent = n ? ` (${n})` : ''));
}
export const setCart = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ } count(); };
export const addToCart = (id, qty = 1) => {
  const c = getCart(), i = c.find(x => x.id === id);
  if (i) i.qty = Math.min(10, i.qty + qty); else c.push({ id, qty: Math.min(10, qty) });
  setCart(c);
};
count();
