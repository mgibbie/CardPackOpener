// deck.js — Hearthstone-style deck builder. Pick a class, browse your collection
// as real card faces split into CLASS / NEUTRAL tabs, and assemble a 40-card
// deck into one of up to 40 slots. Mobile-first: the deck is a slide-up panel.
import { drawCardFace, canonClass, classNameOf, classColorOf, artListeners, preloadArt } from './cardart.js';
import { keywordsFor, richHtml } from './keywords.js';
import * as Col from './collection.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import * as MPX from './mpmode.js';
import { encodeDeck, decodeDeck } from './codec.js';

const MP_ON = MPX.mpMode();
const TOUCH = matchMedia('(pointer: coarse)').matches;
const SIZE = Col.DECK_SIZE;         // 40
const MAX_SLOTS = 40;
const SLOTS_KEY = 'magepunk_decks_v1';
const $ = id => document.getElementById(id);

const MOBILE = matchMedia('(max-width: 820px)');
let PAGE_SIZE = MOBILE.matches ? 9 : 15;

let mpState = null;
let cards = [], cardsById = {};
let collection = {};

let slots = [];        // [{ id, name, classId, cards }]
let editingId = null;  // slot being edited, or null for a brand-new deck
let curClass = '';     // the working deck's class
let firstClass = '';   // first class alphabetically — the default for a new deck
let deck = [];         // working card ids
let curCommander = null, curCompanion = null; // optional loadout (own zones, +1 each)

// own: 'owned' | 'all' | 'missing' — Hearthstone lets you filter down to what
// you still need, which is the view you craft from
const filters = { tab: 'class', search: '', mana: null, type: '', keyword: '', set: '', sort: 'cost', own: 'owned' };
// mirrors the server's CRAFT_COST (server/mp.mjs); crafting is MP-only because
// dust lives on the account — the local sandbox has no dust at all
const CRAFT_COST = { common: 40, uncommon: 80, rare: 100, epic: 400, legendary: 1600 };
const craftCostOf = id => CRAFT_COST[cardsById[id]?.rarity];
const playsetOf = id => limitOf(id);
const isMissing = id => (collection[id] || 0) < playsetOf(id);
const RARITY_RANK = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, basic: 5, special: 6 };
let filtered = [], page = 0;
const tileById = new Map(); // id -> { tile, badge, own } for cheap count updates

// ---------- slot storage ----------
const newId = () => 'd_' + Math.random().toString(36).slice(2, 10);
function loadSlots() {
	if (MP_ON) return Array.isArray(mpState?.decks) ? mpState.decks : [];
	let arr = [];
	const p = safeLoad(SLOTS_KEY, null); if (Array.isArray(p)) arr = p;
	if (!arr.length) {
		const old = Col.loadDeck();
		if (old.length) arr = [{ id: newId(), name: 'My Deck', classId: localStorage.getItem('magepunk_class_v1') || '', cards: old }];
	}
	return arr;
}
const persistFree = () => safeSave(SLOTS_KEY, slots);

// ---------- deck logic ----------
const inDeck = id => deck.filter(d => d === id).length;
const limitOf = id => cardsById[id]?.rarity === 'legendary' ? Col.MAX_LEGENDARY_COPIES : Col.MAX_COPIES;
const myClass = () => curClass;

function flash(msg) {
	$('status').textContent = msg;
	clearTimeout(flash._t);
	flash._t = setTimeout(() => { if ($('status').textContent === msg) $('status').textContent = ''; }, 2500);
}
function addCard(id) {
	if (deck.length >= SIZE) { flash('Deck is full (40).'); return; }
	if (inDeck(id) >= limitOf(id)) { flash(`Max ${limitOf(id)} of that card.`); return; }
	if (inDeck(id) >= (collection[id] || 0)) { flash("You don't own more copies."); return; }
	deck.push(id);
	updateCounts();
}
function removeCard(id) {
	const i = deck.indexOf(id);
	if (i >= 0) deck.splice(i, 1);
	updateCounts();
}

// ---------- collection grid (real card faces) ----------
const isNeutral = c => canonClass(c.cardClass || 'neutral') === 'neutral';
const fitsThisClass = c => {
	const cc = canonClass(c.cardClass || 'neutral');
	return cc !== 'neutral' && (cc === curClass || cc.split('__').includes(curClass));
};
function baseList() {
	if (!curClass) return [];
	return filters.tab === 'neutral' ? cards.filter(isNeutral) : cards.filter(fitsThisClass);
}
const byName = (a, b) => a.name.localeCompare(b.name);
function sortCards(arr) {
	if (filters.sort === 'name') return arr.sort(byName);
	if (filters.sort === 'rarity') return arr.sort((a, b) =>
		(RARITY_RANK[a.rarity || 'common'] - RARITY_RANK[b.rarity || 'common']) || ((a.cost ?? 0) - (b.cost ?? 0)) || byName(a, b));
	return arr.sort((a, b) => // cost (default)
		((a.cost ?? 0) - (b.cost ?? 0)) || (RARITY_RANK[a.rarity || 'common'] - RARITY_RANK[b.rarity || 'common']) || byName(a, b));
}
// keepPage: crafting re-filters the pool (the card may leave the Missing view),
// but yanking you back to page 1 mid-build is a papercut — hold your place.
function applyFilters(keepPage) {
	const was = page;
	filtered = sortCards(baseList().filter(c => {
		if (filters.own === 'owned' && !(collection[c.id] > 0)) return false;
		if (filters.own === 'missing' && !isMissing(c.id)) return false; // what you still need
		if (filters.search && !(`${c.name} ${c.description || ''} ${c.type}`.toLowerCase().includes(filters.search))) return false;
		if (filters.mana != null) { const cost = c.cost ?? 0; if (filters.mana === 7 ? cost < 7 : cost !== filters.mana) return false; }
		if (filters.type && c.type !== filters.type) return false;
		if (filters.keyword && !(c.keywords || []).includes(filters.keyword)) return false;
		if (filters.set && c.set !== filters.set) return false;
		return true;
	}));
	page = keepPage ? Math.max(0, Math.min(was, Math.ceil(filtered.length / PAGE_SIZE) - 1)) : 0;
	renderPage();
}
// populate the type + keyword + set dropdowns from what the collectible pool
// actually contains (so no dead options), each shown title-cased
function buildFilterOptions() {
	// short lowercase codes read better upper-cased (hsx, hs, wubrg); the rest title-case
	const pretty = s => (/^[a-z0-9]{1,5}$/.test(s) ? s.toUpperCase() : String(s).replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()));
	const addOpts = (sel, values, label = pretty) => {
		for (const v of values) { const o = document.createElement('option'); o.value = v; o.textContent = label(v); sel.appendChild(o); }
	};
	addOpts($('type-filter'), [...new Set(cards.map(c => c.type).filter(Boolean))].sort(), s => s.replace(/\b\w/g, m => m.toUpperCase()));
	addOpts($('kw-filter'), [...new Set(cards.flatMap(c => c.keywords || []))].filter(Boolean).sort(), s => String(s).replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()));
	addOpts($('set-filter'), [...new Set(cards.map(c => c.set).filter(Boolean))].sort());
}

function tileFor(card) {
	const tile = document.createElement('div');
	tile.className = 'tile';
	// keyboard-operable: Enter/Space opens the card page (which has an Add button),
	// mirroring the mouse click — drag-to-add stays for pointer users
	tile.setAttribute('role', 'button');
	tile.tabIndex = 0;
	tile.setAttribute('aria-label', card.name + ' — view card');
	tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(card); } });
	const face = drawCardFace(card);
	face.style.width = '100%';
	tile.appendChild(face);
	// Hearthstone-style owned-copies pill under the card (updates to show how
	// many are still free once you start adding them to the deck)
	const owned = document.createElement('div');
	owned.className = 'owned';
	tile.appendChild(owned);
	// Tap/click opens the card's page; DRAG (to the deck) adds it.
	if (TOUCH) {
		tile.addEventListener('touchstart', e => onTouchStart(e, card), { passive: true });
	} else {
		tile.draggable = true;
		tile.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'copy'; hideTip(); });
		tile.addEventListener('click', () => openCard(card));
		attachTip(tile, card);
	}
	tileById.set(card.id, { tile, owned });
	return tile;
}

// ---------- card detail page ----------
let zoomCard = null;
function openCard(card) {
	zoomCard = card;
	const holder = $('zoom-card'); holder.innerHTML = ''; holder.appendChild(drawCardFace(card));
	renderZoomInfo(card);
	$('zoom').classList.add('open');
	// repaint the big face once the real art streams in
	setTimeout(() => { if (zoomCard === card && $('zoom').classList.contains('open')) { holder.innerHTML = ''; holder.appendChild(drawCardFace(card)); } }, 700);
}
function renderZoomInfo(card) {
	const have = collection[card.id] || 0, used = inDeck(card.id);
	const stats = [`Cost ${card.cost ?? 0}`];
	if (card.type === 'creature') stats.push(`${card.attack}/${card.health}`);
	if (card.type === 'weapon') stats.push(`${card.attack} atk · ${card.durability} dur`);
	if (card.type === 'location') stats.push(`${card.durability} uses`);
	$('zoom-info').innerHTML = `<div class="z-name">${card.name}</div>`
		+ `<div class="z-type">${classNameOf(card.cardClass).toUpperCase()} · ${(card.tribe ? card.tribe + ' ' : '')}${(card.type || '').toUpperCase()}${card.rarity ? ' · ' + card.rarity.toUpperCase() : ''}</div>`
		+ `<div class="z-stats">${stats.join(' · ')}</div>`
		+ `<div class="z-desc">${card.description ? richHtml(card.description) : '<i>No rules text.</i>'}</div>`
		+ keywordsFor(card).map(k => `<div class="z-kw"><b>${k.label}</b> — ${k.text}</div>`).join('')
		+ `<div class="z-owned">You own ×${have}${used ? ` · ${used} in this deck` : ''}</div>`;
	refreshCraftBtn();   // openZoom already set zoomCard
}
// ---------- crafting ----------
// The server owns the cost table and the playset cap; this is the button that
// lets you fill a hole WITHOUT leaving the deck you're building, which is the
// whole point of crafting in Hearthstone.
function dustNow() { return MP_ON ? (mpState?.dust || 0) : 0; }
// what "Dust extras" would pay right now — mirrors the server's table, which
// still validates. Dust has exactly ONE source (copies past a playset), so a
// builder that can craft but can't dust would strand you at 0 with no way up.
const DUST_VALUE = { common: 5, uncommon: 10, rare: 20, epic: 100, legendary: 400 };
function extrasGain() {
	let gain = 0;
	for (const [id, n] of Object.entries(collection)) {
		const v = DUST_VALUE[cardsById[id]?.rarity];
		const extra = (n || 0) - limitOf(id);
		if (v && extra > 0) gain += extra * v;
	}
	return gain;
}
function refreshDust() {
	const el = $('dust-bal'), btn = $('dust-extras');
	if (el) {
		el.hidden = !MP_ON;
		if (MP_ON) el.textContent = `💎 ${dustNow().toLocaleString()}`;
	}
	if (btn) {
		const gain = MP_ON ? extrasGain() : 0;
		btn.hidden = gain <= 0;
		btn.textContent = `♻️ Dust extras +${gain.toLocaleString()}`;
	}
}
async function dustExtras() {
	const btn = $('dust-extras');
	btn.disabled = true;
	try {
		const r = await MPX.call('dust-extras');
		if (r.state) { mpState = r.state; collection = mpState.collection || collection; }
		flash(r.gained ? `Dusted ${r.dusted} extra cop${r.dusted === 1 ? 'y' : 'ies'} for 💎 ${r.gained}.` : 'Nothing to dust.');
		refreshDust();
		refreshCraftBtn();
		applyFilters(true);   // dusted copies drop back to a playset, so tiles change
	} catch (e) { await resync('Could not reach the server — showing your saved dust.'); }
	btn.disabled = false;
}
// A dropped connection does NOT mean the server dropped the request: MPX.call
// aborts at 20s, and a craft that timed out client-side has usually already been
// committed. Guessing "it failed" once left the dust spent and the card missing
// from the UI — so on any error, re-read the truth instead of assuming.
async function resync(msg) {
	try {
		const s = await MPX.freshState();
		if (s) { mpState = s; collection = s.collection || collection; }
	} catch {}
	refreshDust();
	if (zoomCard) renderZoomInfo(zoomCard);  // repaints the craft button too
	applyFilters(true);
	flash(msg);
}
function refreshCraftBtn() {
	const btn = $('zoom-craft');
	if (!btn) return;
	const id = zoomCard?.id;
	const cost = id && craftCostOf(id);
	// only where crafting exists, and only for a card you can still add a copy of
	if (!MP_ON || !id || !cost || !isMissing(id)) { btn.hidden = true; return; }
	btn.hidden = false;
	// kept short: three buttons share this row, and "Craft — need 100 dust" wrapped
	const shortBy = cost - dustNow();
	btn.disabled = shortBy > 0;
	btn.textContent = shortBy > 0 ? `⚒ Need 💎${shortBy.toLocaleString()}` : `⚒ Craft 💎${cost}`;
	btn.title = shortBy > 0
		? `${zoomCard.name} costs 💎${cost} — you have 💎${dustNow()}. Dust extra copies to make up the difference.`
		: `Craft ${zoomCard.name} for 💎${cost}`;
}
async function craftZoomCard() {
	const btn = $('zoom-craft');
	const id = zoomCard?.id;
	if (!id || btn.disabled) return;
	btn.disabled = true;
	const label = btn.textContent;
	try {
		const r = await MPX.call('craft', { id });
		if (r.error) {
			btn.textContent = r.error.slice(0, 30);
			setTimeout(() => { btn.textContent = label; refreshCraftBtn(); }, 1800);
			return;
		}
		if (r.state) { mpState = r.state; collection = mpState.collection || collection; }
		else collection[id] = (collection[id] || 0) + 1;
		refreshDust();
		refreshTile(id);
		renderZoomInfo(zoomCard);  // repaint "You own xN" + the button (not openZoom: that reloads the art)
		applyFilters(true);      // a crafted card leaves the Missing view — but hold the page
		flash(`Crafted ${cardsById[id]?.name || id}!`);
	} catch (e) {
		btn.textContent = 'Checking…';
		await resync('Lost the connection — this is what the server has.');
	}
}

function refreshTile(id) {
	const t = tileById.get(id); if (!t) return;
	const used = inDeck(id), have = collection[id] || 0, cap = Math.min(have, limitOf(id));
	// unowned cards (only visible in "All" mode) are dimmed + tagged, still non-addable
	t.tile.classList.toggle('depleted', have === 0 || used >= cap);
	// "left" means addable-to-this-deck, NOT unused copies: owning 7 of a card
	// still only lets 2 into a deck, so `have - used` would promise 5 more.
	t.owned.textContent = have === 0 ? 'Not owned' : (used ? `${cap - used} left · ×${have}` : `×${have}`);
}

let renderToken = 0;
async function renderPage() {
	hideTip(); // the hovered tile may be replaced under the cursor
	tileById.clear();
	const grid = $('grid');
	if (!curClass) {
		grid.innerHTML = '<div id="empty-hint">Pick your <b style="color:#c9b8ff">class</b> above to start building.<br>'
			+ 'The collection then splits into <b>CLASS</b> and <b>NEUTRAL</b> tabs.</div>';
		$('pageinfo').textContent = ''; $('prev').disabled = $('next').disabled = true;
		return;
	}
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	page = Math.min(page, pages - 1);
	const pageCards = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
	$('prev').disabled = page === 0;
	$('next').disabled = page >= pages - 1;
	$('pageinfo').textContent = filtered.length ? `Page ${page + 1} / ${pages} · ${filtered.length} cards` : 'No cards here yet.';
	const token = ++renderToken;
	await preloadArt(pageCards.map(c => c.id));
	if (token !== renderToken) return;
	grid.innerHTML = '';
	if (!pageCards.length) { grid.innerHTML = '<div id="empty-hint">No cards match. Buy packs to grow your collection, or clear the filters.</div>'; return; }
	for (const card of pageCards) grid.appendChild(tileFor(card));
	for (const c of pageCards) refreshTile(c.id);
}
function flip(d) {
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	page = Math.max(0, Math.min(pages - 1, page + d));
	renderPage();
}

// repaint the visible page as real art streams in
let artRepaint = null;
artListeners.add(() => { clearTimeout(artRepaint); artRepaint = setTimeout(renderPage, 140); });

// ---------- deck panel ----------
function renderSlots() {
	const list = $('slot-list');
	list.innerHTML = '';
	$('slot-count').textContent = `${slots.length} / ${MAX_SLOTS}`;
	if (!slots.length) {
		const empty = document.createElement('div');
		empty.id = 'decks-empty';
		empty.textContent = 'No decks yet — create one below to start building. You can save up to 40.';
		list.appendChild(empty);
	}
	for (const s of slots) {
		const valid = Array.isArray(s.cards) && s.cards.length === SIZE;
		const col = classColorOf(s.classId || 'neutral');
		const div = document.createElement('div');
		div.className = 'slot-row' + (s.id === editingId ? ' active' : '');
		// hero art from the OCR class cards as the banner backdrop, darkened on the
		// left for the name; classes without hero art fall back to the class colour
		div.style.background =
			`linear-gradient(90deg, rgba(6,4,12,0.78) 0%, rgba(6,4,12,0.28) 42%, rgba(6,4,12,0.2) 100%), `
			+ `url('art/hero_${s.classId}.jpg') center 20% / cover, ${col}`;
		div.innerHTML = `<span class="s-name">${s.name || s.classId || 'Deck'}</span>`
			+ `<span class="s-count ${valid ? 'full' : 'partial'}">${(s.cards || []).length}/${SIZE}</span>`
			+ `<button class="s-share" title="Copy a share link to this deck">🔗</button>`;
		div.onclick = () => editSlot(s);
		div.querySelector('.s-share').onclick = e => { e.stopPropagation(); shareSlot(s); }; // don't also open the editor
		list.appendChild(div);
	}
	// Create-new-deck button at the BOTTOM of the deck scroll (Hearthstone-style)
	const add = document.createElement('button');
	add.id = 'new-deck';
	add.textContent = '＋ Create New Deck';
	add.onclick = () => newDeck();
	list.appendChild(add);
	$('delete-deck').style.display = editingId ? 'block' : 'none';
}
const showList = () => { $('decks-view').style.display = 'flex'; $('edit-view').style.display = 'none'; };
const showEdit = () => { $('decks-view').style.display = 'none'; $('edit-view').style.display = 'flex'; };
function renderDeckList() {
	hideTip(); // the hovered row may be removed under the cursor
	const dl = $('deck-list');
	dl.innerHTML = '';
	const counts = {};
	for (const id of deck) counts[id] = (counts[id] || 0) + 1;
	const ids = Object.keys(counts).sort((a, b) => (cardsById[a].cost || 0) - (cardsById[b].cost || 0) || cardsById[a].name.localeCompare(cardsById[b].name));
	for (const id of ids) {
		const def = cardsById[id];
		const row = document.createElement('div');
		row.className = 'deck-row';
		row.innerHTML = `<span class="gem">${def.cost ?? 0}</span><span class="dn">${def.name}</span><span class="dx">×${counts[id]}</span>`;
		row.onclick = () => { hideTip(); removeCard(id); };
		if (!TOUCH) attachTip(row, def); // name-only rows benefit the most from the inspect tip
		dl.appendChild(row);
	}
}
function renderLoadout() {
	for (const [kind, id] of [['commander', curCommander], ['companion', curCompanion]]) {
		const el = $('lo-' + kind); if (!el) continue;
		const name = id && cardsById[id] ? cardsById[id].name : 'none — tap to add';
		el.classList.toggle('set', !!id);
		el.innerHTML = `<span class="lo-k">${kind === 'commander' ? '⚔ COMMANDER' : '🐾 COMPANION'}</span><span class="lo-v">${name}</span>`;
	}
}
// live deck analytics: mana-curve histogram + avg cost + type/rarity breakdown
function renderDeckStats() {
	const host = $('deck-stats'); if (!host) return;
	if (!deck.length) { host.style.display = 'none'; return; }
	host.style.display = 'block';
	const buckets = [0, 0, 0, 0, 0, 0, 0, 0]; // costs 0..7+
	const types = {}, rar = {}; let sumCost = 0;
	for (const id of deck) {
		const d = cardsById[id]; if (!d) continue;
		const cost = Math.max(0, d.cost ?? 0);
		buckets[Math.min(7, cost)]++;
		sumCost += cost;
		types[d.type] = (types[d.type] || 0) + 1;
		rar[d.rarity || 'common'] = (rar[d.rarity || 'common'] || 0) + 1;
	}
	const max = Math.max(1, ...buckets);
	const curve = $('ds-curve'); curve.innerHTML = '';
	buckets.forEach((n, i) => {
		const bar = document.createElement('div');
		bar.className = 'ds-bar';
		bar.title = `${n} card${n === 1 ? '' : 's'} at cost ${i === 7 ? '7+' : i}`;
		bar.innerHTML = `<span class="ds-n">${n || ''}</span><span class="ds-fill" style="height:${Math.round((n / max) * 100)}%"></span><span class="ds-cost">${i === 7 ? '7+' : i}</span>`;
		curve.appendChild(bar);
	});
	const avg = (sumCost / deck.length).toFixed(1);
	const spells = (types.sorcery || 0) + (types.secret || 0) + (types.trap || 0) + (types.quest || 0) + (types.enchantment || 0);
	const tparts = [`⌀ ${avg} avg`];
	if (types.creature) tparts.push(`${types.creature} creature${types.creature === 1 ? '' : 's'}`);
	if (spells) tparts.push(`${spells} spell${spells === 1 ? '' : 's'}`);
	if (types.weapon) tparts.push(`${types.weapon} weapon${types.weapon === 1 ? '' : 's'}`);
	$('ds-types').textContent = tparts.join(' · ');
	const rparts = [];
	for (const [k, label] of [['legendary', 'Leg'], ['epic', 'Epic'], ['rare', 'Rare'], ['uncommon', 'Unc'], ['common', 'Com']]) if (rar[k]) rparts.push(`${rar[k]} ${label}`);
	$('ds-rarity').textContent = rparts.join(' · ');
}

function updateCounts() {
	for (const id of tileById.keys()) refreshTile(id);
	renderDeckList();
	renderLoadout();
	renderDeckStats();
	const full = deck.length === SIZE;
	const extras = (curCommander ? 1 : 0) + (curCompanion ? 1 : 0);
	$('deck-count').textContent = extras ? `${deck.length} / ${SIZE}  (+${extras} = ${SIZE + extras})` : `${deck.length} / ${SIZE}`;
	$('deck-count').style.color = full ? '#57e389' : '#e8e2f4';
	$('toggle-deck').textContent = `DECK ${deck.length}/${SIZE}`;
	$('toggle-deck').style.background = full ? '#2f9e5e' : '#6b4fd4';
}

// ---------- commander / companion picker ----------
let pickKind = null;
// commanders/companions are excluded from the collectible grid, so search the
// full card set (cardsById) rather than the filtered `cards` list
const loadoutPool = kind => Object.values(cardsById).filter(c => (kind === 'commander' ? c.commander : c.companion) && Col.fitsClass(c, curClass));
function openLoadoutPicker(kind) {
	if (!curClass) return;
	pickKind = kind;
	$('lopick-title').textContent = kind === 'commander' ? 'Choose a Commander' : 'Choose a Companion';
	const grid = $('lopick-grid'); grid.innerHTML = '';
	const pool = loadoutPool(kind);
	const chosen = kind === 'commander' ? curCommander : curCompanion;
	if (!pool.length) {
		grid.innerHTML = `<div id="lopick-empty">No ${kind}s exist for ${classNameOf(curClass)} yet.</div>`;
	} else {
		preloadArt(pool.map(c => c.id)).then(() => {
			for (const c of pool) {
				const tile = document.createElement('div');
				tile.className = 'tile' + (c.id === chosen ? ' chosen' : '');
				tile.setAttribute('role', 'button');
				tile.tabIndex = 0;
				tile.setAttribute('aria-label', `Choose ${c.name} as ${kind}`);
				const face = drawCardFace(c); face.style.width = '100%'; tile.appendChild(face);
				const pick = () => { setLoadout(kind, c.id); closeLoadoutPicker(); };
				tile.addEventListener('click', pick);
				tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
				grid.appendChild(tile);
			}
		});
	}
	$('lopick-remove').style.display = chosen ? '' : 'none';
	$('lopick').classList.add('open');
}
function setLoadout(kind, id) { if (kind === 'commander') curCommander = id; else curCompanion = id; updateCounts(); }
function closeLoadoutPicker() { $('lopick').classList.remove('open'); pickKind = null; }
$('lo-commander').addEventListener('click', () => openLoadoutPicker('commander'));
$('lo-companion').addEventListener('click', () => openLoadoutPicker('companion'));
$('lopick-remove').addEventListener('click', () => { if (pickKind) setLoadout(pickKind, null); closeLoadoutPicker(); });
$('lopick-close').addEventListener('click', closeLoadoutPicker);
$('lopick').addEventListener('click', e => { if (e.target.id === 'lopick') closeLoadoutPicker(); });

// ---------- switching decks ----------
function editSlot(slot) {
	editingId = slot.id;
	curClass = slot.classId || '';
	deck = [...slot.cards].filter(id => cardsById[id]);
	curCommander = slot.commander || null;
	curCompanion = slot.companion || null;
	$('deck-name').value = slot.name || '';
	$('class-select').value = curClass;
	renderSlots(); applyFilters(); updateCounts(); showEdit();
}
function newDeck() {
	editingId = null;
	curClass = firstClass;   // start on the first class alphabetically, cards showing
	deck = [];
	curCommander = curCompanion = null;
	$('deck-name').value = '';
	$('class-select').value = firstClass;
	renderSlots(); applyFilters(); updateCounts(); showEdit();
}
// return to the My Decks list (keeps any unsaved edit state so re-entering resumes)
function backToDecks() { renderSlots(); showList(); }

// ---------- save / delete ----------
$('save').onclick = async () => {
	if (!myClass()) { flash('Choose a class first.'); return; }
	if (deck.length !== SIZE) { flash(`Decks must be exactly ${SIZE} cards (has ${deck.length}).`); return; }
	const name = ($('deck-name').value || '').trim() || `${myClass()} deck`;
	if (MP_ON) {
		const data = await MPX.call('save-deck', { id: editingId || undefined, name, classId: myClass(), deck, commander: curCommander, companion: curCompanion });
		if (data.error) { flash(data.error); return; }
		mpState = data.state; slots = loadSlots();
		const match = slots.find(s => s.id === editingId) || slots[slots.length - 1];
		if (match) editingId = match.id;
		renderSlots(); flash('Deck saved — take it into card battles.');
		return;
	}
	const err = Col.validateDeck(deck, cardsById, collection, myClass(), curCommander, curCompanion);
	if (err) { flash(err); return; }
	if (editingId) {
		const s = slots.find(x => x.id === editingId);
		if (s) { s.name = name; s.classId = myClass(); s.cards = [...deck]; s.commander = curCommander; s.companion = curCompanion; }
	} else {
		if (slots.length >= MAX_SLOTS) { flash(`All ${MAX_SLOTS} slots are full — delete one first.`); return; }
		const s = { id: newId(), name, classId: myClass(), cards: [...deck], commander: curCommander, companion: curCompanion };
		slots.push(s); editingId = s.id;
	}
	persistFree();
	Col.saveDeck(deck); // keep the single-deck save in sync for legacy code
	safeSaveStr('magepunk_class_v1', myClass());
	renderSlots(); flash('Deck saved!');
};
$('delete-deck').onclick = async () => {
	if (!editingId) return;
	if (MP_ON) {
		const data = await MPX.call('delete-deck', { id: editingId });
		if (data.error) { flash(data.error); return; }
		mpState = data.state; slots = loadSlots();
	} else { slots = slots.filter(s => s.id !== editingId); persistFree(); }
	editingId = null; curClass = firstClass; deck = []; curCommander = curCompanion = null;
	$('deck-name').value = ''; $('class-select').value = firstClass;
	renderSlots(); applyFilters(); updateCounts(); showList();
	flash('Deck deleted.');
};

// ---------- deck codes (share / import / deep-link) ----------
// A deck is shareable three ways, all round-tripping the same code from codec.js:
//   Copy Code — the short code, to paste into another player's Import box.
//   Copy Link — deck.html?deck=<code>, which deep-links straight into this builder.
//   Import    — accepts either a raw code OR a full ?deck= link.
const shareUrlFor = code => location.origin + location.pathname + '?deck=' + code; // code is base64url + '.', all URL-safe
// pull the code out of a pasted ?deck= link, or return the input unchanged if it's already a bare code
const codeFromInput = raw => {
	raw = (raw || '').trim();
	const m = raw.match(/[?&]deck=([^&\s]+)/);
	return m ? decodeURIComponent(m[1]) : raw;
};
const curDeckCode = () => encodeDeck({ classId: myClass(), cards: deck, commander: curCommander, companion: curCompanion });

// Load a decoded deck into the editor as a NEW, unsaved deck to review + Save
// (ownership is only checked on Save, so shared links stay viewable logged-out).
async function loadDeckFromCode(code) {
	const d = await decodeDeck(code);
	if (!d || !d.classId) { flash("That doesn't look like a valid deck code."); return false; }
	const knownClass = [...$('class-select').options].some(o => o.value === d.classId);
	if (!knownClass) { flash(`Unknown class in that code (${d.classId}).`); return false; }
	editingId = null;
	curClass = d.classId;
	deck = d.cards.filter(id => cardsById[id]); // drop any ids this build doesn't know
	curCommander = cardsById[d.commander] ? d.commander : null;
	curCompanion = cardsById[d.companion] ? d.companion : null;
	$('deck-name').value = 'Imported deck';
	$('class-select').value = curClass;
	renderSlots(); applyFilters(); updateCounts(); showEdit();
	const dropped = d.cards.length - deck.length;
	flash(dropped ? `Loaded — ${dropped} unknown card${dropped === 1 ? '' : 's'} skipped. Review & Save.` : 'Deck loaded — review & Save.');
	return true;
}

$('export-code').onclick = async () => {
	if (!myClass() || !deck.length) { flash('Build a deck first, then copy its code.'); return; }
	const code = await curDeckCode();
	try { await navigator.clipboard.writeText(code); flash('Deck code copied — share it!'); }
	catch { prompt('Copy this deck code:', code); } // clipboard blocked — show it to copy by hand
};
$('copy-link').onclick = async () => {
	if (!myClass() || !deck.length) { flash('Build a deck first, then copy its link.'); return; }
	const url = shareUrlFor(await curDeckCode());
	try { await navigator.clipboard.writeText(url); flash('Share link copied — anyone who opens it lands on this deck.'); }
	catch { prompt('Copy this deck link:', url); }
};
$('import-code').onclick = async () => {
	const raw = prompt('Paste a deck code or share link to load it:');
	if (!raw) return;
	await loadDeckFromCode(codeFromInput(raw));
};

// Share a SAVED deck straight from the My Decks list (no need to open it first).
async function shareSlot(s) {
	if (!Array.isArray(s.cards) || !s.cards.length) { flash('That deck is empty — nothing to share yet.'); return; }
	const url = shareUrlFor(await encodeDeck({ classId: s.classId, cards: s.cards, commander: s.commander, companion: s.companion }));
	try { await navigator.clipboard.writeText(url); flash(`Share link copied for "${s.name || s.classId || 'deck'}".`); }
	catch { prompt('Copy this deck link:', url); }
}

// ---------- tabs, filters, pager, mobile toggle ----------
for (const btn of document.querySelectorAll('.tab')) {
	btn.addEventListener('click', () => {
		filters.tab = btn.dataset.tab;
		document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b === btn));
		applyFilters();
	});
}
$('search').addEventListener('input', ev => { filters.search = ev.target.value.toLowerCase(); applyFilters(); });
$('type-filter').addEventListener('change', ev => { filters.type = ev.target.value; applyFilters(); });
$('kw-filter').addEventListener('change', ev => { filters.keyword = ev.target.value; applyFilters(); });
$('set-filter').addEventListener('change', ev => { filters.set = ev.target.value; applyFilters(); });
$('sort-by').addEventListener('change', ev => { filters.sort = ev.target.value; applyFilters(); });
$('owned-toggle').addEventListener('click', () => {
	// Owned -> All -> Missing -> Owned. "Missing" is only useful where you can
	// actually craft, so the local sandbox keeps the old two-way toggle.
	const order = MP_ON ? ['owned', 'all', 'missing'] : ['owned', 'all'];
	filters.own = order[(order.indexOf(filters.own) + 1) % order.length];
	const b = $('owned-toggle');
	b.classList.toggle('on', filters.own !== 'all');
	b.textContent = { owned: 'Owned', all: 'All', missing: 'Missing' }[filters.own];
	applyFilters();
});
$('prev').addEventListener('click', () => flip(-1));
$('next').addEventListener('click', () => flip(1));
$('back-to-decks').addEventListener('click', backToDecks);
$('toggle-deck').addEventListener('click', () => $('deck-panel').classList.toggle('open'));
$('panel-close').addEventListener('click', () => $('deck-panel').classList.remove('open'));
MOBILE.addEventListener('change', () => { PAGE_SIZE = MOBILE.matches ? 9 : 15; renderPage(); });

// ---------- card page (zoom) wiring ----------
$('zoom-add').addEventListener('click', () => { if (!zoomCard) return; addCard(zoomCard.id); renderZoomInfo(zoomCard); showEdit(); });
$('zoom-close').addEventListener('click', () => $('zoom').classList.remove('open'));
$('zoom-craft').addEventListener('click', craftZoomCard);
$('dust-extras').addEventListener('click', dustExtras);
$('zoom').addEventListener('click', e => { if (e.target.id === 'zoom') $('zoom').classList.remove('open'); });
addEventListener('keydown', e => { if (e.key === 'Escape') $('zoom').classList.remove('open'); });

// ---------- drag a card onto the deck to add it ----------
function dropAdd(id) { if (!id) return; addCard(id); showEdit(); }
// mouse: native HTML5 drag-and-drop, deck panel is the drop zone
const panel = $('deck-panel');
panel.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; panel.classList.add('drop-hover'); });
panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-hover'); });
panel.addEventListener('drop', e => { e.preventDefault(); panel.classList.remove('drop-hover'); dropAdd(e.dataTransfer.getData('text/plain')); });

// touch: long-press a card, then drag it onto the deck panel / DECK button
let tdrag = null;
const moveGhost = (x, y) => { if (tdrag?.ghost) { tdrag.ghost.style.left = x + 'px'; tdrag.ghost.style.top = y + 'px'; } };
const dropTargetAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('#deck-panel, #toggle-deck'); };
function onTouchStart(e, card) {
	if (e.touches.length !== 1) return;
	const t = e.touches[0];
	tdrag = { card, sx: t.clientX, sy: t.clientY, dragging: false };
	tdrag.hold = setTimeout(() => { if (tdrag) beginTouchDrag(t.clientX, t.clientY); }, 260);
}
function beginTouchDrag(x, y) {
	tdrag.dragging = true;
	navigator.vibrate?.(12);
	const g = document.createElement('div'); g.className = 'drag-ghost';
	g.appendChild(drawCardFace(tdrag.card));
	document.body.appendChild(g); tdrag.ghost = g; moveGhost(x, y);
	$('toggle-deck').classList.add('drop-target');
}
function clearTouchDrag() {
	if (!tdrag) return;
	clearTimeout(tdrag.hold); tdrag.ghost?.remove();
	$('toggle-deck').classList.remove('drop-target', 'drop-hover'); $('deck-panel').classList.remove('drop-hover');
	tdrag = null;
}
document.addEventListener('touchmove', e => {
	if (!tdrag) return;
	const t = e.touches[0], dist = Math.hypot(t.clientX - tdrag.sx, t.clientY - tdrag.sy);
	if (!tdrag.dragging) { if (dist > 12) { clearTimeout(tdrag.hold); tdrag = null; } return; } // a scroll, not a drag
	e.preventDefault(); // hold the page still while dragging a card
	moveGhost(t.clientX, t.clientY);
	const tgt = dropTargetAt(t.clientX, t.clientY);
	$('toggle-deck').classList.toggle('drop-hover', !!(tgt && tgt.id === 'toggle-deck'));
	$('deck-panel').classList.toggle('drop-hover', !!(tgt && tgt.id === 'deck-panel'));
}, { passive: false });
document.addEventListener('touchend', e => {
	if (!tdrag) return;
	const d = tdrag, t = e.changedTouches[0];
	if (d.dragging) { if (dropTargetAt(t.clientX, t.clientY)) dropAdd(d.card.id); clearTouchDrag(); }
	else {
		clearTouchDrag();
		if (Math.hypot(t.clientX - d.sx, t.clientY - d.sy) < 10) openCard(d.card); // a tap opens the card page
	}
});
document.addEventListener('touchcancel', clearTouchDrag);

// mana crystal filter row (0..6, 7+)
for (let i = 0; i <= 7; i++) {
	const b = document.createElement('button');
	b.className = 'crystal';
	b.textContent = i === 7 ? '7+' : String(i);
	b.addEventListener('click', () => {
		filters.mana = filters.mana === i ? null : i;
		document.querySelectorAll('.crystal').forEach((c, j) => c.classList.toggle('on', filters.mana === j));
		applyFilters();
	});
	$('mana-row').appendChild(b);
}

// ---------- starter deck templates (one per class, all new-account-owned) ----------
let starterDecks = [];
fetch('starter-decks.json').then(r => r.json()).then(({ decks }) => { starterDecks = decks || []; renderStarters(); }).catch(() => {});
function renderStarters() {
	const host = $('starter-list'); if (!host || !starterDecks.length) return;
	host.innerHTML = '';
	for (const s of [...starterDecks].sort((a, b) => a.name.localeCompare(b.name))) {
		const row = document.createElement('button');
		row.className = 'starter-row';
		row.innerHTML = `<span class="st-name">${s.name}</span><span class="st-go">Load ›</span>`;
		row.addEventListener('click', () => loadStarterDeck(s));
		host.appendChild(row);
	}
	$('starter-section').style.display = 'block';
}
// load a template into the editor as a NEW, unsaved deck to review + Save (mirrors
// loadDeckFromCode). The starter is legal + fully owned, so Save works immediately.
function loadStarterDeck(s) {
	if (!cardsReady) { flash('Still loading cards — try again in a moment.'); return; }
	editingId = null;
	curClass = s.classId;
	deck = (s.cards || []).filter(id => cardsById[id]);
	curCommander = curCompanion = null;
	$('deck-name').value = s.name;
	$('class-select').value = curClass;
	renderSlots(); applyFilters(); updateCounts(); showEdit();
	const dropped = (s.cards || []).length - deck.length;
	flash(dropped ? `Loaded ${s.name} — ${dropped} card${dropped === 1 ? '' : 's'} unavailable. Review & Save.` : `Loaded ${s.name} — review, then Save!`);
}

// ---------- class picker (sorted A→Z; first one is the default) + boot ----------
let classesReady = false, cardsReady = false;
function maybeInit() {
	if (!classesReady || !cardsReady) return;
	slots = loadSlots();
	renderSlots();
	// A ?deck=<code> share link deep-links straight into the builder on that deck;
	// otherwise open on the blank starting page with the first class selected.
	const linkCode = new URLSearchParams(location.search).get('deck');
	if (linkCode) openFromLink(linkCode); else newDeck();
	window.__deck = { get deck() { return deck; }, get slots() { return slots; }, addCard, removeCard, editSlot, newDeck, loadDeckFromCode, Col };
}
async function openFromLink(code) {
	const loaded = await loadDeckFromCode(code);
	if (!loaded) newDeck(); // bad/stale link → fall back to a fresh blank deck
	// tidy the URL so a refresh (or re-copying the page URL) isn't stuck on this import
	try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
}

fetch('classes.json').then(r => r.json()).then(({ classes }) => {
	const sel = $('class-select');
	const sorted = classes.slice().sort((a, b) => a.name.localeCompare(b.name));
	sel.innerHTML = '';
	for (const c of sorted) {
		const opt = document.createElement('option');
		opt.value = c.id; opt.textContent = c.name;
		sel.appendChild(opt);
	}
	firstClass = sorted[0]?.id || '';
	sel.addEventListener('change', ev => {
		curClass = ev.target.value;
		deck = deck.filter(id => Col.fitsClass(cardsById[id], curClass));
		applyFilters(); updateCounts();
	});
	classesReady = true;
	maybeInit();
}).catch(() => {});

fetch('cards.json').then(r => r.json()).then(async data => { // plain fetch: let the _headers 5-min cache skip the revalidation RTT
	const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, special: 5 };
	cards = data.cards.filter(Col.collectible).slice().sort((a, b) =>
		(a.cost ?? 0) - (b.cost ?? 0)
		|| (rarityOrder[a.rarity || 'common'] - rarityOrder[b.rarity || 'common'])
		|| a.name.localeCompare(b.name));
	for (const d of data.cards) cardsById[d.id] = d;
	buildFilterOptions(); // type + keyword dropdowns from the loaded pool
	if (MP_ON) { mpState = await MPX.freshState(); collection = mpState?.collection || {}; }
	else { collection = Col.getCollection(data.cards); }
	refreshDust();
	cardsReady = true;
	maybeInit();
});

// ---------- hover tooltip (packs-style inspect, shared look with /collection) ----------
const tipEl = document.getElementById('tip');
const tipEsc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function tipHtml(def) {
	const stat = def.type === 'creature' ? ` · ${def.attack}/${def.health}`
		: def.type === 'weapon' ? ` · ${def.attack}/${def.durability}`
		: def.type ? ` · ${tipEsc(def.type)}` : '';
	const owned = collection[def.id] > 0 ? ` · ×${collection[def.id]} owned` : '';
	const kw = def.keywords?.length ? `<div class="kws">${tipEsc(def.keywords.join(', '))}</div>` : '';
	const kwLines = keywordsFor(def).map(k =>
		`<div class="kwline"><b>${tipEsc(k.label)}</b> <span style="opacity:0.85">${tipEsc(k.text)}</span></div>`).join('');
	return `<div class="nm">${tipEsc(def.name)} <span class="cost">(${def.cost ?? 0})</span></div>`
		+ `<div class="meta">${tipEsc(def.rarity || 'common')} ${tipEsc(classNameOf(def.cardClass))}${stat}${def.tribe ? ' · ' + tipEsc(def.tribe) : ''}${owned}</div>`
		+ kw
		+ (def.description ? `<div class="rules">${richHtml(def.description)}</div>` : '')
		+ kwLines;
}
function placeTip(e) {
	if (tipEl.style.display !== 'block') return;
	const x = Math.min(e.clientX + 16, innerWidth - tipEl.offsetWidth - 8);
	const y = Math.min(e.clientY + 16, innerHeight - tipEl.offsetHeight - 8);
	tipEl.style.left = Math.max(8, x) + 'px';
	tipEl.style.top = Math.max(8, y) + 'px';
}
function hideTip() { tipEl.style.display = 'none'; }
function attachTip(el, def) {
	el.addEventListener('mouseenter', e => { tipEl.innerHTML = tipHtml(def); tipEl.style.display = 'block'; placeTip(e); });
	el.addEventListener('mousemove', placeTip);
	el.addEventListener('mouseleave', hideTip);
}
