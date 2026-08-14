// deck.js — Hearthstone-style deck builder. Pick a class, browse your collection
// as real card faces split into CLASS / NEUTRAL tabs, and assemble a 40-card
// deck into one of up to 40 slots. Mobile-first: the deck is a slide-up panel.
import { drawCardFace, canonClass, classNameOf, classColorOf, artListeners, preloadArt } from './cardart.js';
import { keywordsFor, richHtml } from './keywords.js';
import * as Col from './collection.js';
import * as MPX from './mpmode.js';

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

const filters = { tab: 'class', search: '', mana: null, type: '', keyword: '', set: '', sort: 'cost', owned: true };
const RARITY_RANK = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, basic: 5, special: 6 };
let filtered = [], page = 0;
const tileById = new Map(); // id -> { tile, badge, own } for cheap count updates

// ---------- slot storage ----------
const newId = () => 'd_' + Math.random().toString(36).slice(2, 10);
function loadSlots() {
	if (MP_ON) return Array.isArray(mpState?.decks) ? mpState.decks : [];
	let arr = [];
	try { const p = JSON.parse(localStorage.getItem(SLOTS_KEY)); if (Array.isArray(p)) arr = p; } catch (e) {}
	if (!arr.length) {
		const old = Col.loadDeck();
		if (old.length) arr = [{ id: newId(), name: 'My Deck', classId: localStorage.getItem('magepunk_class_v1') || '', cards: old }];
	}
	return arr;
}
const persistFree = () => localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));

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
function applyFilters() {
	filtered = sortCards(baseList().filter(c => {
		if (filters.owned && !(collection[c.id] > 0)) return false; // "All" shows the whole pool
		if (filters.search && !(`${c.name} ${c.description || ''} ${c.type}`.toLowerCase().includes(filters.search))) return false;
		if (filters.mana != null) { const cost = c.cost ?? 0; if (filters.mana === 7 ? cost < 7 : cost !== filters.mana) return false; }
		if (filters.type && c.type !== filters.type) return false;
		if (filters.keyword && !(c.keywords || []).includes(filters.keyword)) return false;
		if (filters.set && c.set !== filters.set) return false;
		return true;
	}));
	page = 0;
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
}
function refreshTile(id) {
	const t = tileById.get(id); if (!t) return;
	const used = inDeck(id), have = collection[id] || 0, cap = Math.min(have, limitOf(id));
	// unowned cards (only visible in "All" mode) are dimmed + tagged, still non-addable
	t.tile.classList.toggle('depleted', have === 0 || used >= cap);
	t.owned.textContent = have === 0 ? 'Not owned' : (used ? `${have - used} left · ×${have}` : `×${have}`);
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
			+ `<span class="s-count ${valid ? 'full' : 'partial'}">${(s.cards || []).length}/${SIZE}</span>`;
		div.onclick = () => editSlot(s);
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
function updateCounts() {
	for (const id of tileById.keys()) refreshTile(id);
	renderDeckList();
	renderLoadout();
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
				const face = drawCardFace(c); face.style.width = '100%'; tile.appendChild(face);
				tile.addEventListener('click', () => { setLoadout(kind, c.id); closeLoadoutPicker(); });
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
	localStorage.setItem('magepunk_class_v1', myClass());
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
	filters.owned = !filters.owned;
	const b = $('owned-toggle');
	b.classList.toggle('on', filters.owned);
	b.textContent = filters.owned ? 'Owned' : 'All';
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

// ---------- class picker (sorted A→Z; first one is the default) + boot ----------
let classesReady = false, cardsReady = false;
function maybeInit() {
	if (!classesReady || !cardsReady) return;
	slots = loadSlots();
	renderSlots();
	newDeck(); // open on the blank starting page with the first class selected
	window.__deck = { get deck() { return deck; }, get slots() { return slots; }, addCard, removeCard, editSlot, newDeck, Col };
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

fetch('cards.json').then(r => r.json()).then(async data => {
	const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, special: 5 };
	cards = data.cards.filter(Col.collectible).slice().sort((a, b) =>
		(a.cost ?? 0) - (b.cost ?? 0)
		|| (rarityOrder[a.rarity || 'common'] - rarityOrder[b.rarity || 'common'])
		|| a.name.localeCompare(b.name));
	for (const d of data.cards) cardsById[d.id] = d;
	buildFilterOptions(); // type + keyword dropdowns from the loaded pool
	if (MP_ON) { mpState = await MPX.freshState(); collection = mpState?.collection || {}; }
	else { collection = Col.getCollection(data.cards); }
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
