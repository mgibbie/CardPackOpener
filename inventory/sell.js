// inventory/sell.js — THE SELL RIBBON (owner, 2026-11-25: "Selling should work like jokers in Micatro: the sell ribbon
// can appear when selected"; Plans/INVENTORY_TRADE_SELL_PLAN.md stage 2).
//
// A tile that can be sold carries data-sell="<key>" (inventory.js marks them and says what each key IS: sellableOf).
//   select a tile (click, tap, Z / A on it)   -> it is marked and a gold ribbon appears on it: "SELL 269 ★"
//                                                (a stack: "SELL 1" and "SELL ALL"; a currency: "SELL…", which asks how many)
//   press the ribbon                          -> ALWAYS a confirm ("Sell Croconaw Lv 29 for 269 ★?"), Keep focused first
//   Sell                                      -> the server sells it (server/sell.mjs: its price, not the page's)
//   afterwards, for ten minutes               -> a bar at the top: "Sold … for 269 ★ · Take it back"
// Keyboard, controller and touch all work: tiles and ribbons are ordinary focus stops (site/focusnav.js), X / Esc backs out.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => (Math.round(+n) || 0).toLocaleString('en-US');

/**
 * opts: { root (the inventory's element), call(action, body), toast(msg), sellableOf(key) -> null | { name, n, amount?,
 *         why? (why it cannot be sold now), lose: [line], offer(count), value(count) }, onChange() (reload and redraw) }
 */
export function initSell(opts) {
	const { root, call, toast, sellableOf, onChange } = opts;
	const S = { key: null, busy: false, sale: null, tick: 0 };
	const dlg = document.getElementById('sell-confirm'), bar = document.getElementById('sale-bar');

	// ---------- selecting a tile: the ribbon ----------
	function clear() { S.key = null; for (const e of root.querySelectorAll('.sel')) e.classList.remove('sel'); for (const e of root.querySelectorAll('.sell-ribbons')) e.remove(); }
	// (a key press reaches a tile twice: the page's focus navigation clicks it, and so may the browser. One press is one select.)
	addEventListener('keydown', () => { S.keyAt = performance.now(); }, true);
	function select(el) {
		const key = el.dataset.sell, d = sellableOf(key), t = performance.now(), viaKey = t - (S.keyAt || -1e9) < 120;
		if (S.key === key && t - (S.selAt || -1e9) < 350) return;
		S.selAt = t;
		if (S.key === key) { clear(); return; }
		clear();
		if (!d) return;
		S.key = key; el.classList.add('sel');
		const box = document.createElement('div'); box.className = 'sell-ribbons';
		const rib = (label, count, more = '') => `<button type="button" class="sell-ribbon bal-btn bal-gold" data-count="${count}"${more}>${label}</button>`;
		if (d.why) box.innerHTML = `<span class="sell-why">${esc(d.why)}</span>`;
		else if (d.amount) box.innerHTML = rib('SELL…', 0);
		else if (d.n > 1) box.innerHTML = rib(`SELL 1 · ${num(d.value(1))} ★`, 1) + rib(`SELL ALL ${num(d.n)} · ${num(d.value(d.n))} ★`, d.n);
		else box.innerHTML = rib(`SELL · ${num(d.value(1))} ★`, 1);
		el.appendChild(box);
		for (const b of box.querySelectorAll('.sell-ribbon')) b.addEventListener('click', (ev) => { ev.stopPropagation(); ask(key, +b.dataset.count); });
		// (the ribbon takes the focus. From Enter or Space: only once the key is up, or the same press would press the ribbon too)
		const first = box.querySelector('.sell-ribbon'), go = () => { if (first.isConnected) first.focus({ preventScroll: true }); };
		if (first) { if (viaKey) document.addEventListener('keyup', go, { once: true }); else go(); }
	}
	root.addEventListener('click', (ev) => { const el = ev.target.closest('[data-sell]'); if (!el || !root.contains(el) || ev.target.closest('.sell-ribbons')) return; select(el); });
	root.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-sell]')) { ev.preventDefault(); select(ev.target); } });
	document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && S.key && dlg.hidden) { const el = root.querySelector('.sel'); clear(); if (el) el.focus({ preventScroll: true }); } });

	// ---------- the confirm (always) ----------
	function ask(key, count) {
		const d = sellableOf(key); if (!d || d.why) return;
		const asking = !!d.amount, n0 = asking ? Math.min(d.n, 1) : count;
		dlg.innerHTML = `<div class="sell-box bal-panel" role="document">
			<h2 id="sell-title">${asking ? `Sell ${esc(d.name)}` : `Sell ${esc(count > 1 ? count + ' × ' + d.name : d.name)}?`}</h2>
			${asking ? `<label class="sell-amt">How many? <small>you have ${num(d.n)}</small><input type="number" id="sell-n" inputmode="numeric" min="1" max="${d.n}" value="${n0}"></label>` : ''}
			<p class="sell-for">for <b id="sell-stars">${num(d.value(n0))} ★</b></p>
			${(d.lose || []).filter(Boolean).map(l => `<p class="sell-lose">${esc(l)}</p>`).join('')}
			<p class="sell-note">You can take it back for ten minutes, at the same price.</p>
			<div class="sell-acts"><button type="button" class="bal-btn bal-back" id="sell-no">Keep</button><button type="button" class="bal-btn bal-gold" id="sell-yes">Sell</button></div>
		</div>`;
		dlg.hidden = false;
		const inp = dlg.querySelector('#sell-n'), amount = () => (asking ? Math.max(0, Math.min(d.n, Math.floor(+inp.value) || 0)) : count);
		if (inp) inp.addEventListener('input', () => { dlg.querySelector('#sell-stars').textContent = num(d.value(amount())) + ' ★'; dlg.querySelector('#sell-yes').disabled = amount() < 1; });
		const close = () => { dlg.hidden = true; dlg.innerHTML = ''; const el = root.querySelector('.sel .sell-ribbon') || root.querySelector('.sel'); if (el) el.focus({ preventScroll: true }); };
		dlg.querySelector('#sell-no').addEventListener('click', close);
		dlg.querySelector('#sell-yes').addEventListener('click', async () => {
			const c = amount(); if (c < 1 || S.busy) return;
			S.busy = true; dlg.querySelector('#sell-yes').disabled = true;
			let r = null; try { r = await call('inv-sell', { offer: d.offer(c) }); } catch (e) { r = null; }
			// (carried out a moment later: ask until it says)
			for (let i = 0; r && !r.ok && !r.error && r.sale && i < 8; i++) { await new Promise(res => setTimeout(res, 400)); r = await call('inv-sale', {}); if (r && r.sale && r.sale.phase === 'paid') r = { ok: true, stars: r.sale.stars, sale: r.sale }; }
			S.busy = false; dlg.hidden = true; dlg.innerHTML = '';
			if (!r || !r.ok) { toast((r && r.error) ? r.error[0].toUpperCase() + r.error.slice(1) : 'That could not be sold. Try again.'); clear(); await onChange(); return; }
			clear(); toast(`Sold for ${num(r.stars)} ★`);
			await onChange(); showSale(r.sale, c > 1 ? c + ' × ' + d.name : d.name);
		});
		dlg.querySelector(inp ? '#sell-n' : '#sell-no').focus({ preventScroll: true });
	}
	dlg.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); const b = dlg.querySelector('#sell-no'); if (b) b.click(); } });

	// ---------- the newest sale: take it back ----------
	const clock = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
	function showSale(sale, name) {
		clearInterval(S.tick); S.sale = null;
		if (!sale || sale.phase !== 'paid' || !(sale.undoLeft > 0)) { bar.hidden = true; bar.innerHTML = ''; return; }
		S.sale = { ...sale, until: Date.now() + sale.undoLeft, name: name || (S.sale && S.sale.id === sale.id && S.sale.name) || 'Your last sale' };
		bar.innerHTML = `<span class="sale-what">${name ? 'Sold ' + esc(name) : 'Your last sale'}: <b>${num(sale.stars)} ★</b></span><button type="button" class="bal-btn bal-blue" id="sale-undo">Take it back <small id="sale-left">${clock(sale.undoLeft)}</small></button>`;
		bar.hidden = false;
		bar.querySelector('#sale-undo').addEventListener('click', undo);
		S.tick = setInterval(() => { const left = S.sale ? S.sale.until - Date.now() : 0; const e = document.getElementById('sale-left'); if (left <= 0) { clearInterval(S.tick); bar.hidden = true; bar.innerHTML = ''; S.sale = null; } else if (e) e.textContent = clock(left); }, 500);
	}
	async function undo() {
		if (S.busy) return; S.busy = true;
		let r = null; try { r = await call('inv-sell-undo', {}); } catch (e) { r = null; }
		for (let i = 0; r && !r.ok && !r.error && r.sale && i < 8; i++) { await new Promise(res => setTimeout(res, 400)); r = await call('inv-sale', {}); if (r && r.sale && r.sale.phase === 'undone') r = { ok: true, sale: r.sale }; }
		S.busy = false;
		if (!r || !r.ok) { toast((r && r.error) ? r.error[0].toUpperCase() + r.error.slice(1) : 'That could not be taken back. Try again.'); if (r && r.sale) showSale(r.sale); return; }
		clearInterval(S.tick); bar.hidden = true; bar.innerHTML = ''; S.sale = null;
		toast('Taken back.'); await onChange();
	}
	/** On load: is there a sale that can still be taken back? */
	async function refresh() { try { const r = await call('inv-sale', {}); showSale(r && r.sale); } catch (e) { /* no bar: fine */ } }
	return { refresh, clear, state: () => ({ key: S.key, sale: S.sale ? { id: S.sale.id, stars: S.sale.stars } : null, asking: !dlg.hidden }) };
}
