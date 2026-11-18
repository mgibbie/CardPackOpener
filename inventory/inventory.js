// inventory.js — the site's one Inventory: everything a player owns in every game, and the window they trade it in.
//
// What is shown (and where it is kept):
//   stars                         the star wallet (site/stars.js; on the account when signed in)
//   Battlecards                   cards, packs, dust, gold        (the account)
//   Pocket Enhanced               cards, packs, packs of a booster, pack points   (the account's collection)
//   MicaSurvivor                  coins, gacha tickets, Pokémon   (its save, on the account)
//   the overworld                 money, coins, the bag, the party and the box    (this device: the game keeps them)
//
// The trade window follows RuneScape's: my offer on one side of a line, the other player's on the other; each of us
// has a Lock in button; when both are locked in a four-second countdown runs (either can still back out) and then the
// trade is carried out, with a short link-cable scene. It is the site's one trading system (server/trade.mjs): this
// page only shows it. What can be put up here is what the server keeps: stars, dust, gold, Battlecards cards and
// packs, Pocket Enhanced cards and packs, MicaSurvivor coins and tickets. The overworld's Pokémon, items, money and
// Game Corner coins are the game's to hand over: overworld/ow_handover.js does it here with the game's own code, when
// no game is running and this device's save is up to date; otherwise that tab says why not.
import * as MP from '../battlecards/mpmode.js';
import * as Stars from '/site/stars.js';
import { ITEMS, getBag, getMoney, getCoins, nameOf } from '../overworld/bag.js';
import { loadItemIcons, itemIconFile, drawCategoryIcon } from '../overworld/itemicon.js';
import * as HO from '../overworld/ow_handover.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const num = n => (Math.floor(+n) || 0).toLocaleString();
const call = async (a, b) => { try { return await MP.call(a, b || {}); } catch (e) { return null; } };
const readLS = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

// ------------------------------------------------------------------ what I own
const INV = { signedIn: false, name: '', stars: 0, bc: { cards: {}, packs: 0, dust: 0, gold: 0 }, pk: null, ms: null, ow: { money: 0, coins: 0, bag: {}, party: [], box: [] } };
let PKC = null, PKD = null, BCNAMES = null;   // Pocket's modules and the Battlecards card names: loaded when first needed
async function pocketMods() { if (!PKC) [PKC, PKD] = await Promise.all([import('../pocketenhanced/js/collection.js'), import('../pocketenhanced/js/data/cards.js')]); return PKC; }
async function bcNames() { if (!BCNAMES) { BCNAMES = {}; try { const j = await (await fetch('/battlecards/cards.json')).json(); for (const c of (j.cards || j)) BCNAMES[c.id] = c.name; } catch (e) { /* ids are shown instead */ } } return BCNAMES; }
const printName = id => { const p = PKC && PKC.printInfo(id), c = p && PKD.card(p.card); return c ? `${c.name} ${PKC.RARITY[p.rarity] || ''}`.trim() : id; };
const boosterName = id => { const b = PKC && PKC.BOOSTERS.find(x => x.id === id); return b ? b.name : id; };

export async function loadInventory() {
	INV.signedIn = MP.hasToken();
	INV.ow = { money: getMoney() || 0, coins: (typeof getCoins === 'function' && getCoins()) || 0, bag: getBag() || {}, party: readLS('magepunk_party_v1') || [], box: readLS('magepunk_box_v1') || [] };
	if (!INV.signedIn) { INV.stars = Stars.stars(); return INV; }
	let s = null; try { s = await MP.freshState(); } catch (e) { s = MP.cachedState(); }
	if (s) { INV.name = s.username || ''; INV.bc = { cards: s.collection || {}, packs: s.packs || 0, dust: s.dust || 0, gold: s.gold || 0 }; }
	const [, pk, ms] = await Promise.all([Stars.sync((a, b) => MP.call(a, b)), call('pkcol-get'), call('micasurvivor-save-get'), pocketMods()]);
	INV.stars = Stars.stars();
	INV.pk = pk && pk.col ? PKC.cleanCollection(pk.col) : null;
	INV.ms = ms && ms.save ? { coins: ms.save.coins || 0, t1: (ms.save.tickets && ms.save.tickets.t1) || 0, t10: (ms.save.tickets && ms.save.tickets.t10) || 0, owned: Object.keys(ms.save.owned || {}).length } : null;
	return INV;
}

// ------------------------------------------------------------------ the page
const POCKETS = [
	{ label: 'Balls', test: it => it?.kind === 'ball' }, { label: 'Medicine', test: it => ['heal', 'revive', 'cure', 'ether'].includes(it?.kind) }, { label: 'Berries', test: (it, id) => /berry$/.test(id) },
	{ label: 'Held items', test: (it, id) => it?.kind === 'held' && !/berry$/.test(id) }, { label: 'TMs & HMs', test: (it, id) => it?.kind === 'tm' || it?.kind === 'hm' || /^tm|^hm/.test(id) },
	{ label: 'Key items', test: it => ['key', 'charm', 'seeker', 'rod', 'form'].includes(it?.kind) }, { label: 'Other', test: () => true },
];
function iconEl(id, item) {
	const file = itemIconFile(id);
	if (file) { const img = document.createElement('img'); img.src = '../overworld/item_icons/' + file; img.alt = ''; img.loading = 'lazy'; return img; }
	const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32; drawCategoryIcon(cv.getContext('2d'), item?.kind || 'misc', id, 0, 0, 32); return cv;
}
const chip = (k, ico, n, label, where) => `<div class="chip" data-k="${k}" title="${esc(where)}"><span class="ci">${ico}</span><b>${num(n)}</b><span class="cl">${esc(label)}</span></div>`;
const section = (k, title, where, link, body) => { const s = h('section', 'sec'); s.dataset.k = k; s.innerHTML = `<div class="section-label"><span>${esc(title)}</span><small>${esc(where)}</small>${link ? `<a href="${link[0]}">${esc(link[1])} →</a>` : ''}</div>`; s.appendChild(body); return s; };
const total = o => Object.values(o || {}).reduce((a, b) => a + (b || 0), 0), kinds = o => Object.values(o || {}).filter(n => n > 0).length;

export function render() {
	const root = $('content'); root.innerHTML = '';
	const ACC = 'on your account', DEV = 'on this device';
	// ---- the wallet: every currency, in one row
	const w = h('div', 'wallet');
	w.innerHTML = chip('stars', '★', INV.stars, 'Stars', INV.signedIn ? ACC : DEV) +
		(INV.signedIn ? chip('dust', '✦', INV.bc.dust, 'Dust', ACC) + chip('gold', '●', INV.bc.gold, 'Gold', ACC) + chip('bcpacks', '▮', INV.bc.packs, 'Battlecards packs', ACC) : '') +
		(INV.pk ? chip('pkpacks', '▮', INV.pk.packs + PKC.ownPacks(INV.pk), 'Pocket packs', ACC) + chip('pkpoints', '◈', INV.pk.points, 'Pack points', ACC) : '') +
		(INV.ms ? chip('mscoins', '◉', INV.ms.coins, 'MicaSurvivor coins', ACC) + chip('mst1', '🎟', INV.ms.t1, 'Tickets', ACC) + chip('mst10', '🎟', INV.ms.t10, '10-pull tickets', ACC) : '') +
		chip('money', '$', INV.ow.money, 'Overworld money', DEV) + chip('coins', '◎', INV.ow.coins, 'Game Corner coins', DEV);
	root.appendChild(w);
	const bar = h('div', 'actions');
	const tb = h('button', 'btn trade', INV.signedIn ? 'Trade with a friend' : 'Sign in to trade'); tb.type = 'button'; tb.id = 'open-trade';
	tb.addEventListener('click', () => { if (INV.signedIn) openTradeLobby(); else location.href = '/login/?next=' + encodeURIComponent('/inventory/'); });
	bar.appendChild(tb); root.appendChild(bar);
	if (!INV.signedIn) root.appendChild(h('p', 'note', 'You are not signed in: this shows what is on this device. Sign in to see your cards, packs and currencies, and to trade.'));
	// ---- Battlecards
	if (INV.signedIn) {
		const g = h('div', 'grid');
		g.innerHTML = tile('▦', `${num(kinds(INV.bc.cards))} different cards`, `${num(total(INV.bc.cards))} copies`) + tile('▮', `${num(INV.bc.packs)} packs`, 'unopened') + tile('✦', `${num(INV.bc.dust)} dust`, 'for crafting') + tile('●', `${num(INV.bc.gold)} gold`, 'buys packs');
		root.appendChild(section('battlecards', 'Battlecards', ACC, ['/collection/', 'Your cards'], g));
	}
	// ---- Pocket Enhanced
	if (INV.pk) {
		const g = h('div', 'grid'), own = Object.entries(INV.pk.own || {}).filter(([, n]) => n > 0);
		g.innerHTML = tile('▦', `${num(PKC.uniqueOwned(INV.pk))} different cards`, `${num(total(INV.pk.prints))} copies`) + tile('▮', `${num(INV.pk.packs)} packs`, 'of any booster') + tile('◈', `${num(INV.pk.points)} pack points`, 'exchange for a card') +
			own.sort((a, b) => boosterName(a[0]).localeCompare(boosterName(b[0]))).map(([id, n]) => tile('▮', `${esc(boosterName(id))} pack`, `×${num(n)}`)).join('');
		root.appendChild(section('pocket', 'Pocket Enhanced', ACC, ['/pocketenhanced/', 'Play'], g));
	} else if (INV.signedIn) root.appendChild(section('pocket', 'Pocket Enhanced', ACC, ['/pocketenhanced/', 'Play'], h('p', 'note', 'No cards yet: open the game to get your starter decks and packs.')));
	// ---- MicaSurvivor
	if (INV.ms) {
		const g = h('div', 'grid');
		g.innerHTML = tile('◉', `${num(INV.ms.coins)} coins`, '') + tile('🎟', `${num(INV.ms.t1)} tickets`, 'one pull each') + tile('🎟', `${num(INV.ms.t10)} 10-pull tickets`, '') + tile('◓', `${num(INV.ms.owned)} Pokémon`, 'partners owned');
		root.appendChild(section('micasurvivor', 'MicaSurvivor', ACC, ['/micasurvivor/', 'Play'], g));
	}
	// ---- the overworld: the party and box, then the bag by pocket
	const mons = [...INV.ow.party.map(m => [m, 'party']), ...INV.ow.box.map(m => [m, 'box'])];
	if (mons.length) {
		const g = h('div', 'grid');
		for (const [m, at] of mons.slice(0, 60)) { const t = h('div', 'item'); t.innerHTML = `<div class="ico">${m.sprite ? `<img src="../overworld/data/pokemon/${esc(m.sprite)}" alt="" loading="lazy">` : '◓'}</div><div><div class="nm">${esc(m.name || m.speciesId || 'Pokémon')}</div><div class="ct">Lv ${num(m.level)} · ${at}</div></div>`; g.appendChild(t); }
		if (mons.length > 60) g.appendChild(h('p', 'note', `and ${mons.length - 60} more in the box`));
		root.appendChild(section('pokemon', `Overworld Pokémon (${mons.length})`, DEV, ['/overworld/', 'Play'], g));
	}
	const owned = Object.entries(INV.ow.bag).filter(([, n]) => n > 0), used = new Set();
	if (owned.length) {
		const wrap = h('div', '');
		for (const p of POCKETS) {
			const rows = owned.filter(([id]) => !used.has(id) && p.test(ITEMS[id], id)); if (!rows.length) continue;
			rows.forEach(([id]) => used.add(id));
			wrap.appendChild(h('div', 'pocket-label', `${p.label} · ${rows.length}`));
			const g = h('div', 'grid');
			for (const [id, n] of rows.sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))) { const t = h('div', 'item'), ico = h('div', 'ico'); ico.appendChild(iconEl(id, ITEMS[id])); t.appendChild(ico); t.appendChild(h('div', '', `<div class="nm">${esc(nameOf(id))}</div><div class="ct">×${num(n)}</div>`)); g.appendChild(t); }
			wrap.appendChild(g);
		}
		root.appendChild(section('bag', `Overworld bag (${owned.length})`, DEV, ['/overworld/', 'Play'], wrap));
	} else root.appendChild(section('bag', 'Overworld bag', DEV, ['/overworld/', 'Play'], h('p', 'note', 'Your bag is empty. Explore the overworld to pick things up.')));
}
const tile = (ico, name, sub) => `<div class="item"><div class="ico">${ico}</div><div><div class="nm">${name}</div><div class="ct">${sub}</div></div></div>`;

// ------------------------------------------------------------------ trading
const T = { id: null, role: 'a', other: '', trade: null, mine: null, timer: 0, sendT: 0, sending: false, lobbyT: 0, tab: 'money', q: '', scene: false, goAt: 0, tickT: 0, owWhy: null, handing: false, handed: false, stamp: '' };
const monName = m => `${m.name || m.speciesId || 'Pokémon'} Lv ${m.level || '?'}`;
const owes = o => !!o && ((o.pokemon || []).length > 0 || (o.items || []).length > 0 || o.money > 0 || o.coins > 0);
const emptyOffer = () => ({ cards: {}, packs: 0, dust: 0, gold: 0, stars: 0, pk: { prints: {}, packs: 0, own: {} }, ms: { coins: 0, t1: 0, t10: 0 }, pokemon: [], items: [], money: 0, coins: 0 });
// MicaSurvivor's three: [key in the window, field of the offer's `ms`, field of what I own, icon, name]
const MS = [['mscoins', 'coins', 'coins', '◉', 'MicaSurvivor coins'], ['mst1', 't1', 't1', '🎟', 'MicaSurvivor ticket'], ['mst10', 't10', 't10', '🎟', 'MicaSurvivor 10-pull ticket']];
const msOf = k => MS.find(m => m[0] === k);
const layer = () => $('trade');
function closeTrade() { clearTimeout(T.timer); clearTimeout(T.lobbyT); clearInterval(T.tickT); T.id = null; T.trade = null; T.scene = false; layer().hidden = true; layer().innerHTML = ''; document.body.classList.remove('trading'); }

/** Who to trade with: friends to ask, and friends who have asked. */
async function openTradeLobby() {
	const L = layer(); L.hidden = false; document.body.classList.add('trading');
	const box = h('div', 'tw lobby'); box.innerHTML = '<h2>Trade with a friend</h2><p class="note">Ask a friend, or accept a friend who has asked. The window opens for both of you; nothing moves until you have both locked in.</p><div class="list" id="tl"></div><div class="row"><button type="button" class="btn ghost" id="tclose">Close</button></div>';
	L.innerHTML = ''; L.appendChild(box); $('tclose').addEventListener('click', closeTrade);
	let friends = null, asks = [], alive = true;
	const draw = () => {
		const l = $('tl'); if (!l) return; l.innerHTML = '';
		for (const a of asks) { const b = h('button', 'btn go', `<b>${esc(a.from)}</b> wants to trade — accept`); b.type = 'button'; b.dataset.k = 'accept:' + a.from; b.addEventListener('click', async () => { const r = await call('trade-open', { from: a.from }); if (r && r.tradeId) { alive = false; openWindow(r.tradeId, 'b', a.from, r.trade); } else toast((r && r.error) || 'That request has expired.'); }); l.appendChild(b); }
		if (!friends) l.appendChild(h('p', 'note', 'Asking who your friends are…'));
		else if (!friends.length) l.appendChild(h('p', 'note', 'You have no friends added yet. Add one from the top bar, then come back.'));
		else for (const f of friends) { const b = h('button', 'btn ' + (f.online ? '' : 'ghost'), `Ask <b>${esc(f.username)}</b> <small>${f.online ? 'online' : 'not here now'}</small>`); b.type = 'button'; b.dataset.k = 'ask:' + f.username; b.addEventListener('click', async () => { const r = await call('challenge', { to: f.username, battleType: 'trade' }); toast(r && r.ok ? `Asked ${f.username}. The window opens when they accept (they have a minute).` : (r && r.error) || 'Could not ask.'); }); l.appendChild(b); }
	};
	const poll = async () => {
		if (!alive || !box.isConnected) return;
		const [fr, ch, mine] = await Promise.all([friends ? null : call('friends'), call('challenges'), call('trade-mine')]);
		if (!alive || !box.isConnected) return;
		if (mine && mine.tradeId) { alive = false; openWindow(mine.tradeId, mine.role || 'a', mine.trade ? (mine.role === 'b' ? mine.trade.a : mine.trade.b) : '', mine.trade); return; }   // (the window the other player opened, or one I was in before a reload)
		if (fr && Array.isArray(fr.friends)) friends = fr.friends.slice().sort((x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0) || x.username.localeCompare(y.username));
		asks = ch && Array.isArray(ch.challenges) ? ch.challenges.filter(c => c.type === 'trade') : asks;
		draw(); T.lobbyT = setTimeout(poll, 1500);
	};
	draw(); poll();
}

/** An offer as rows to show: [{ key, icon, name, n }]. */
function offerRows(o) {
	const out = []; if (!o) return out;
	if (o.stars) out.push({ key: 'stars', icon: '★', name: 'Stars', n: o.stars });
	if (o.dust) out.push({ key: 'dust', icon: '✦', name: 'Dust', n: o.dust });
	if (o.gold) out.push({ key: 'gold', icon: '●', name: 'Gold', n: o.gold });
	for (const m of MS) if (o.ms && o.ms[m[1]]) out.push({ key: m[0], icon: m[3], name: m[4], n: o.ms[m[1]] });
	if (o.packs) out.push({ key: 'bcpacks', icon: '▮', name: 'Battlecards pack', n: o.packs });
	for (const [id, n] of Object.entries(o.cards || {})) out.push({ key: 'bc:' + id, icon: '▦', name: (BCNAMES && BCNAMES[id]) || id, n, sub: 'Battlecards' });
	if (o.pk && o.pk.packs) out.push({ key: 'pkpacks', icon: '▮', name: 'Pocket pack', n: o.pk.packs });
	for (const [id, n] of Object.entries((o.pk && o.pk.own) || {})) out.push({ key: 'own:' + id, icon: '▮', name: boosterName(id) + ' pack', n, sub: 'Pocket Enhanced' });
	for (const [id, n] of Object.entries((o.pk && o.pk.prints) || {})) out.push({ key: 'pk:' + id, icon: '▦', name: printName(id), n, sub: 'Pocket Enhanced' });
	if (o.money) out.push({ key: 'owmoney', icon: '$', name: 'Overworld money', n: o.money });
	if (o.coins) out.push({ key: 'owcoins', icon: '◎', name: 'Game Corner coins', n: o.coins });
	for (const m of o.pokemon || []) out.push({ key: 'mon:' + (m._src || ''), icon: '◓', name: monName(m), n: 1, sub: 'Overworld', fixed: !m._src });
	for (const it of o.items || []) out.push({ key: 'item:' + it.id, icon: '◇', name: nameOf(it.id), n: it.count, sub: 'Overworld' });
	return out;
}
/** What I own of a thing, and what I have put up of it; and setting how many are put up. */
function have(key) {
	const [k, id] = key.split(/:(.*)/s);
	if (msOf(k)) return INV.ms ? INV.ms[msOf(k)[2]] || 0 : 0;
	if (k === 'owmoney') return INV.ow.money; if (k === 'owcoins') return INV.ow.coins; if (k === 'item') return INV.ow.bag[id] || 0;
	if (k === 'mon') { const [z, i] = id.split(':'); return (z === 'party' ? INV.ow.party : INV.ow.box)[+i] ? 1 : 0; }
	return k === 'stars' ? INV.stars : k === 'dust' ? INV.bc.dust : k === 'gold' ? INV.bc.gold : k === 'bcpacks' ? INV.bc.packs : k === 'bc' ? INV.bc.cards[id] || 0 : !INV.pk ? 0 : k === 'pkpacks' ? INV.pk.packs : k === 'own' ? PKC.packsOf(INV.pk, id) : k === 'pk' ? INV.pk.prints[id] || 0 : 0;
}
function put(key) { const [k, id] = key.split(/:(.*)/s), o = T.mine; if (msOf(k)) return o.ms[msOf(k)[1]] || 0; if (k === 'owmoney') return o.money; if (k === 'owcoins') return o.coins; if (k === 'item') return (o.items.find(it => it.id === id) || {}).count || 0; if (k === 'mon') return o.pokemon.some(m => m._src === id) ? 1 : 0; return k === 'stars' ? o.stars : k === 'dust' ? o.dust : k === 'gold' ? o.gold : k === 'bcpacks' ? o.packs : k === 'bc' ? o.cards[id] || 0 : k === 'pkpacks' ? o.pk.packs : k === 'own' ? o.pk.own[id] || 0 : k === 'pk' ? o.pk.prints[id] || 0 : 0; }
function setPut(key, n) {
	const [k, id] = key.split(/:(.*)/s), o = T.mine, cap = k === 'stars' || k === 'dust' || k === 'gold' || k === 'mscoins' || k === 'owmoney' ? 10_000_000 : msOf(k) || k === 'owcoins' ? 9999 : k === 'item' ? 999 : 99; n = Math.max(0, Math.min(have(key), cap, Math.floor(+n) || 0));
	const m = (map, i) => { if (n) map[i] = n; else delete map[i]; };
	if (k === 'owmoney') o.money = n; else if (k === 'owcoins') o.coins = n;
	else if (k === 'item') { o.items = o.items.filter(it => it.id !== id); if (n && (o.items.length < 20)) o.items.push({ id, count: n }); else if (n) toast('That is as many kinds of item as one trade holds.'); }
	else if (k === 'mon') { o.pokemon = o.pokemon.filter(m => m._src !== id); const [z, i] = id.split(':'), mon = (z === 'party' ? INV.ow.party : INV.ow.box)[+i]; if (n && mon) { if (o.pokemon.length >= 6) toast('A trade holds six Pokémon at most.'); else if (z === 'party' && o.pokemon.filter(m => String(m._src).startsWith('party:')).length >= INV.ow.party.length - 1) toast('You cannot trade away your whole party.'); else o.pokemon.push({ ...JSON.parse(JSON.stringify(mon)), _src: id }); } }
	else if (msOf(k)) o.ms[msOf(k)[1]] = n; else if (k === 'stars') o.stars = n; else if (k === 'dust') o.dust = n; else if (k === 'gold') o.gold = n; else if (k === 'bcpacks') o.packs = n; else if (k === 'bc') m(o.cards, id); else if (k === 'pkpacks') o.pk.packs = n; else if (k === 'own') m(o.pk.own, id); else if (k === 'pk') m(o.pk.prints, id);
	clearTimeout(T.sendT); T.sendT = setTimeout(sendOffer, 250); drawWindow();
}
async function sendOffer() { if (!T.id) return; T.sending = true; const r = await call('trade-update', { id: T.id, offer: T.mine }); T.sending = false; if (r && r.trade) take(r.trade); }

async function openWindow(id, role, other, trade) {
	clearTimeout(T.lobbyT);
	Object.assign(T, { id, role, other, trade: null, mine: emptyOffer(), scene: false, tab: 'money', q: '', owWhy: 'Checking your overworld save…', handing: false, handed: false, stamp: '' });
	HO.whyNot().then(w => { T.owWhy = w; if (T.id === id && T.tab === 'ow' && !T.scene) drawWindow(); });
	layer().hidden = false; document.body.classList.add('trading');
	await Promise.all([pocketMods(), bcNames()]);
	if (trade) { const o = role === 'a' ? trade.offerA : trade.offerB; T.mine = { ...emptyOffer(), ...o, pk: { ...emptyOffer().pk, ...(o.pk || {}) }, ms: { ...emptyOffer().ms, ...(o.ms || {}) }, pokemon: (o.pokemon || []).slice(), items: (o.items || []).map(it => ({ ...it })) }; take(trade); } else drawWindow();
	const poll = async () => { if (!T.id) return; const r = await call('trade-poll', { id: T.id }); if (!T.id) return; if (r && r.gone) { toast('That trade is over.'); closeTrade(); return; } if (r && r.trade) take(r.trade); T.timer = setTimeout(poll, 1000); };
	clearTimeout(T.timer); T.timer = setTimeout(poll, 600);
	clearInterval(T.tickT); T.tickT = setInterval(() => { const c = $('tcount'); if (c && T.goAt) { const left = Math.max(0, T.goAt - Date.now()); c.textContent = String(Math.max(1, Math.ceil(left / 1000))); } }, 100);
}
/** The trade as the server has it. */
function take(t) {
	const was = T.trade; T.trade = t;
	T.goAt = t.goIn != null ? Date.now() + t.goIn : 0;
	// both locked in and everything the server keeps is held: what I put up from the overworld is handed over by the game's own code
	{ const [me] = sideOf(), mine = t['offer' + me];
		if (t.phase === 'wait' && owes(mine) && !t['depo' + me] && !T.handing && !T.handed) { T.handing = true; const id = t.id;
			HO.handOver(id, mine, me).then(async r => { T.handing = false; if (r.ok) { T.handed = true; if (r.trade && T.id === id) take(r.trade); } else { toast(r.why); const c = await call('trade-cancel', { id }); if (c && c.trade && T.id === id) take(c.trade); } }); } }
	if (t.phase !== 'talk' && !T.scene && !t.cancelled) { T.scene = true; playScene(); return; }
	if (t.cancelled && !(was && was.cancelled)) { clearTimeout(T.timer); drawEnd(false); return; }
	// (the window is asked about once a second: it is only drawn again when something in it has changed, so a field
	// being typed in and the keyboard's or controller's place are left alone)
	const stamp = JSON.stringify([t.offerA, t.offerB, t.acceptA, t.acceptB, t.goIn != null, t.phase]);
	if (!T.scene && (stamp !== T.stamp || !layer().querySelector('.tw.win'))) { T.stamp = stamp; drawWindow(); }
}
/** Where the player is in the window (the field with the typing in it, the ring of a keyboard or controller), by a
 *  name that survives the window being drawn again. */
const placeOf = e => (!e || !e.dataset ? null : e.id ? '#' + e.id : e.dataset.amt ? `[data-amt="${e.dataset.amt}"]` : e.dataset.add ? `[data-add="${CSS.escape(e.dataset.add)}"]` : e.dataset.tab ? `[data-tab="${e.dataset.tab}"]` : e.dataset.k ? `[data-k="${CSS.escape(e.dataset.k)}"]` : null);
function keepingPlace(draw) {
	const L = layer(), a = document.activeElement, nav = window.__focusnav, typed = a && L.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) ? { at: placeOf(a), v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
	const ring = nav && nav.ringOn && nav.focused && L.contains(nav.focused) ? placeOf(nav.focused) : null;
	draw();
	if (ring) { const e = L.querySelector(ring); if (e && !e.disabled) { try { nav.focusTo(e); nav.showRing(); } catch (x) { /* the navigator finds the nearest stop itself */ } } }
	if (typed && typed.at) { const e = L.querySelector(typed.at); if (e) { try { e.focus(); e.value = ''; e.value = typed.v;   /* (set after the focus: the caret is then at the end, where an amount is typed) */ if (e.type !== 'number') e.setSelectionRange(typed.s, typed.e); } catch (x) { e.value = typed.v; } } }
}
const sideOf = () => (T.role === 'a' ? ['A', 'B'] : ['B', 'A']);
function drawWindow() { keepingPlace(drawWindowNow); }
function drawWindowNow() {
	const L = layer(), t = T.trade, [me, them] = sideOf(), iLock = !!(t && t['accept' + me]), theyLock = !!(t && t['accept' + them]), counting = !!(t && t.goIn != null);
	const theirs = offerRows(t ? t['offer' + them] : null), mine = offerRows(T.mine);
	const slot = (r, mineSide) => `<button type="button" class="slot${r.fixed ? ' fixed' : ''}" data-k="${mineSide ? 'mine:' : 'theirs:'}${esc(r.key)}" ${mineSide && !r.fixed ? '' : 'disabled'} title="${mineSide ? 'Take one back' : ''}"><span class="si">${r.icon}</span><span class="sn">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><b class="sc">×${num(r.n)}</b></button>`;
	const half = (who, rows, locked, mineSide) => `<div class="half ${mineSide ? 'mine' : 'theirs'}${locked ? ' locked' : ''}" data-side="${mineSide ? 'mine' : 'theirs'}"><div class="who">${esc(who)}${locked ? '<span class="lk">LOCKED IN</span>' : ''}</div><div class="slots">${rows.map(r => slot(r, mineSide)).join('') || '<p class="none">Nothing offered yet</p>'}</div></div>`;
	const status = counting ? `Trading in <b id="tcount">4</b>… <small>either of you can still back out</small>` : iLock && !theyLock ? `Waiting for ${esc(T.other)} to lock in` : theyLock && !iLock ? `<b>${esc(T.other)}</b> has locked in. Check their side, then lock in.` : 'Put up what you offer, then lock in. Changing an offer unlocks both of you.';
	const box = h('div', 'tw win' + (counting ? ' counting' : ''));
	box.innerHTML = `<h2>Trading with ${esc(T.other)}</h2>
		<div class="table">${half(INV.name || 'You', mine, iLock, true)}<div class="divider" aria-hidden="true"><i></i></div>${half(T.other, theirs, theyLock, false)}</div>
		<div class="status" id="tstatus" role="status">${status}</div>
		<div class="row"><button type="button" class="btn ${iLock ? 'ghost' : 'go'}" id="tlock" data-k="lock">${iLock ? 'Unlock' : 'Lock in'}</button><button type="button" class="btn danger" id="tcancel" data-k="cancel">Cancel trade</button></div>
		<div class="picker" id="tpick"></div>`;
	L.innerHTML = ''; L.appendChild(box);
	$('tlock').addEventListener('click', async () => { clearTimeout(T.sendT); if (T.sending) await new Promise(r => setTimeout(r, 300)); const r = await call('trade-lock', { id: T.id, accepted: !iLock, count: true }); if (r && r.error) toast(r.error); if (r && r.trade) take(r.trade); });
	$('tcancel').addEventListener('click', async () => { const r = await call('trade-cancel', { id: T.id }); if (r && r.trade) take(r.trade); else closeTrade(); });
	for (const b of box.querySelectorAll('.half.mine .slot:not(.fixed)')) b.addEventListener('click', () => { const key = b.dataset.k.slice(5); setPut(key, /^(stars|dust|gold|mscoins|mst1|mst10|owmoney|owcoins)$/.test(key) ? 0 : put(key) - 1); });
	drawPicker(iLock || counting);
}
/** My things, to put up: currencies by amount, cards and packs one press at a time. */
function drawPicker(lockedIn) {
	const p = $('tpick'); if (!p) return;
	const tabs = [['money', 'Currencies'], ['packs', 'Packs'], ['bc', 'Battlecards cards'], ['pk', 'Pocket cards'], ['ow', 'Overworld']];
	const amount = x => { const [k, ico, l] = x.split(':'); return `<label class="amt"><span class="si">${ico}</span><span>${l} <small>you have ${num(have(k))}</small></span><input type="number" inputmode="numeric" min="0" max="${have(k)}" value="${put(k) || ''}" placeholder="0" data-amt="${k}" aria-label="${l} to offer"></label>`; };
	let html = `<div class="tabs">${tabs.map(([k, l]) => `<button type="button" class="tab${T.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`;
	if (lockedIn) html += '<p class="note">You are locked in. Unlock to change your offer.</p>';
	else if (T.tab === 'money') html += ['stars:★:Stars', 'dust:✦:Dust', 'gold:●:Gold', ...(INV.ms ? MS.map(m => `${m[0]}:${m[3]}:${m[4]}s`) : [])].map(x => { const [k, ico, l] = x.split(':'); return `<label class="amt"><span class="si">${ico}</span><span>${l} <small>you have ${num(have(k))}</small></span><input type="number" inputmode="numeric" min="0" max="${have(k)}" value="${put(k) || ''}" placeholder="0" data-amt="${k}" aria-label="${l} to offer"></label>`; }).join('');
	else if (T.tab === 'ow' && T.owWhy) html += `<p class="note" id="owwhy">${esc(T.owWhy)}</p>`;
	else {
		let rows = [];
		if (T.tab === 'ow') {
			html += '<p class="note">These are in your overworld game on this device. They leave it when the trade is carried out; what you receive is put in it (Pokémon in your PC box).</p>' + ['owmoney:$:Overworld money', 'owcoins:◎:Game Corner coins'].map(amount).join('');
			INV.ow.party.forEach((m, i) => rows.push(['mon:party:' + i, monName(m), 'in your party']));
			INV.ow.box.forEach((m, i) => rows.push(['mon:box:' + i, monName(m), 'in your PC box']));
			for (const id of Object.keys(INV.ow.bag)) rows.push(['item:' + id, nameOf(id), 'item']);
		}
		else if (T.tab === 'packs') { rows.push(['bcpacks', 'Battlecards pack', 'Battlecards']); if (INV.pk) { rows.push(['pkpacks', 'Pocket pack (any booster)', 'Pocket Enhanced']); for (const id of Object.keys(INV.pk.own || {})) rows.push(['own:' + id, boosterName(id) + ' pack', 'Pocket Enhanced']); } }
		else if (T.tab === 'bc') rows = Object.keys(INV.bc.cards).map(id => ['bc:' + id, (BCNAMES && BCNAMES[id]) || id, '']);
		else if (INV.pk) rows = Object.keys(INV.pk.prints).map(id => ['pk:' + id, printName(id), id]);
		const q = T.q.trim().toLowerCase();
		rows = rows.filter(r => have(r[0]) > 0 && (!q || r[1].toLowerCase().includes(q))); if (T.tab !== 'ow') rows.sort((a, b) => a[1].localeCompare(b[1]));
		if (T.tab === 'bc' || T.tab === 'pk') html += `<input type="search" class="find" id="tfind" placeholder="Search your cards" value="${esc(T.q)}" aria-label="Search your cards">`;
		html += `<div class="have">${rows.slice(0, 80).map(r => `<button type="button" class="hv" data-add="${esc(r[0])}" ${put(r[0]) >= have(r[0]) && !r[0].startsWith('mon:') ? 'disabled' : ''}><span class="sn">${esc(r[1])}${r[2] ? `<small>${esc(r[2])}</small>` : ''}</span><b class="sc">${put(r[0]) ? put(r[0]) + ' / ' : ''}${num(have(r[0]))}</b></button>`).join('') || '<p class="none">Nothing here to offer</p>'}${rows.length > 80 ? `<p class="note">${rows.length - 80} more: search to narrow them down.</p>` : ''}</div>`;
	}
	p.innerHTML = html;
	for (const b of p.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { T.tab = b.dataset.tab; T.q = ''; drawPicker(lockedIn); });
	for (const i of p.querySelectorAll('[data-amt]')) i.addEventListener('change', () => setPut(i.dataset.amt, i.value));
	for (const b of p.querySelectorAll('[data-add]')) b.addEventListener('click', () => { const k = b.dataset.add; setPut(k, k.startsWith('mon:') && put(k) ? 0 : put(k) + 1); });   // (a Pokémon put up: press again to take it back)
	const f = $('tfind'); if (f) f.addEventListener('input', () => { T.q = f.value; const at = f.selectionStart; drawPicker(lockedIn); const g = $('tfind'); if (g) { g.focus(); try { g.setSelectionRange(at, at); } catch (e) { /* not a text field */ } } });
}

/** The trade is being carried out: a link-cable scene. My bundle travels down the cable one way, theirs the other;
 *  they pass in the middle. The scene ends when it has run AND the server says the trade is done. */
function playScene() {
	clearInterval(T.tickT);
	const L = layer(), t = T.trade, [me, them] = sideOf(), mine = offerRows(t['offer' + me]), theirs = offerRows(t['offer' + them]);
	const ball = rows => (rows[0] ? rows[0].icon : '·');
	const box = h('div', 'tw scene');
	box.innerHTML = `<h2>Trading…</h2>
		<div class="cable" aria-hidden="true">
			<div class="unit left"><div class="screen">${esc((INV.name || 'You').slice(0, 10))}</div><div class="pad"><i></i><b></b><b></b></div></div>
			<div class="wire"><span class="pulse out">${ball(mine)}</span><span class="pulse in">${ball(theirs)}</span></div>
			<div class="unit right"><div class="screen">${esc(T.other.slice(0, 10))}</div><div class="pad"><i></i><b></b><b></b></div></div>
		</div>
		<div class="status" id="tstatus" role="status">${esc(INV.name || 'You')} and ${esc(T.other)} are trading. Do not close this page.</div>`;
	L.innerHTML = ''; L.appendChild(box);
	const started = Date.now(), calm = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })(), MIN = calm ? 400 : 4200;
	const wait = () => {
		if (!T.id) return; const cur = T.trade;
		if (cur.cancelled) { drawEnd(false); return; }
		if (cur.phase === 'wait') { const s = $('tstatus'), [me2] = sideOf(); if (s) s.textContent = owes(cur['offer' + me2]) && !cur['depo' + me2] ? 'Handing over what you put up from the overworld…' : `Waiting for ${T.other}'s overworld game to hand over what was offered there (${Math.ceil((cur.waitLeft || 0) / 1000)} s)…`; }
		if (cur.done && Date.now() - started >= MIN) { drawEnd(true); return; }
		setTimeout(wait, 200);
	};
	wait();
}
async function drawEnd(done) {
	clearTimeout(T.timer); clearInterval(T.tickT);
	const L = layer(), t = T.trade, [me, them] = sideOf(), got = done ? offerRows(t['offer' + them]) : [], gave = done ? offerRows(t['offer' + me]) : [];
	const list = rows => (rows.length ? rows.map(r => `<li><span class="si">${r.icon}</span> ${esc(r.name)} <b>×${num(r.n)}</b></li>`).join('') : '<li class="none">nothing</li>');
	const box = h('div', 'tw end ' + (done ? 'ok' : 'off'));
	box.innerHTML = done ? `<h2>Trade complete!</h2><div class="table"><div class="half"><div class="who">You received</div><ul id="tgot">${list(got)}</ul></div><div class="divider" aria-hidden="true"><i></i></div><div class="half"><div class="who">${esc(T.other)} received</div><ul id="tgave">${list(gave)}</ul></div></div>${owes(t['offer' + them]) ? '<p class="note" id="towsay">What came from the overworld is put in your overworld game (Pokémon in your PC box).</p>' : ''}<div class="row"><button type="button" class="btn go" id="tdone" data-k="done">Done</button></div>`
		: `<h2>Trade cancelled</h2><p class="note" id="twhy">${esc((t && t.why) || 'The trade did not happen.')} Everything that was put up is back with its owner.</p><div class="row"><button type="button" class="btn" id="tdone" data-k="done">Close</button></div>`;
	L.innerHTML = ''; L.appendChild(box);
	$('tdone').addEventListener('click', async () => { closeTrade(); await loadInventory(); render(); });
	// what I own now. Things from the overworld that arrived, or came back, are taken into the save here when that is safe
	// (ow_handover.js); when it is not (the game is running, or this device is behind), the game takes them in itself.
	const moved = owes(t.offerA) || owes(t.offerB), s = moved ? await HO.settle() : null, say = $('towsay');
	if (moved && !s && say) say.textContent = 'What came from the overworld waits for you there: open the game on this device to collect it.';
	await loadInventory(); render();
}
// Back (Esc; X on a keyboard and the cancel button of a controller arrive as Esc, site/focusnav.js): closes the list of
// friends and the end screen. In the trade window itself it only leaves a field being typed in: a trade is cancelled
// with its own button, never by a stray press.
addEventListener('keydown', ev => {
	if (ev.key !== 'Escape' || layer().hidden) return;
	const tw = layer().querySelector('.tw'); if (!tw) return;
	if (tw.classList.contains('lobby')) { ev.preventDefault(); closeTrade(); const b = $('open-trade'); if (b && window.__focusnav && window.__focusnav.ringOn) window.__focusnav.focusTo(b); }
	else if (tw.classList.contains('end')) { ev.preventDefault(); const d = $('tdone'); if (d) d.click(); }
});
let toastT = 0;
function toast(msg) { const e = $('toast'); e.textContent = msg; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 3800); }

// ------------------------------------------------------------------ start
export async function start() {
	await loadItemIcons('../overworld/');
	await loadInventory(); render();
	window.__inventory = { ready: true, inv: () => INV, trade: () => (T.id ? { id: T.id, role: T.role, other: T.other, trade: T.trade, mine: T.mine, scene: T.scene } : null), reload: async () => { await loadInventory(); render(); } };
	if (INV.signedIn) { HO.settle().then(async s => { if (s && (s.got.length || s.restored)) { toast(s.got.length ? 'Something from a trade was put in your overworld game.' : 'A trade did not go through: what you put up is back in your overworld game.'); await loadInventory(); render(); } }); }   // (arrivals from a trade made elsewhere)
	if (INV.signedIn) { const mine = await call('trade-mine'); if (mine && mine.tradeId) openWindow(mine.tradeId, mine.role || 'a', mine.trade ? (mine.role === 'b' ? mine.trade.a : mine.trade.b) : '', mine.trade); }   // (a trade I was in before a reload)
}
