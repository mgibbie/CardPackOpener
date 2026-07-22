// deck.js — Hearthstone-style deck builder. Pick a class, browse your collection
// as real card faces split into CLASS / NEUTRAL tabs, and assemble a 40-card
// deck into one of up to 40 slots. Mobile-first: the deck is a slide-up panel.
import { drawCardFace, canonClass, classNameOf, artListeners, preloadArt } from './cardart.js';
import * as Col from './collection.js';
import * as MPX from './mpmode.js';

const MP_ON = MPX.mpMode();
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
let curClass = '';     // the working deck's class (class-first)
let deck = [];         // working card ids

const filters = { tab: 'class', search: '', mana: null };
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
function applyFilters() {
	filtered = baseList().filter(c => {
		if (!(collection[c.id] > 0)) return false;
		if (filters.search && !(`${c.name} ${c.description || ''} ${c.type}`.toLowerCase().includes(filters.search))) return false;
		if (filters.mana != null) { const cost = c.cost ?? 0; if (filters.mana === 7 ? cost < 7 : cost !== filters.mana) return false; }
		return true;
	});
	page = 0;
	renderPage();
}

function tileFor(card) {
	const tile = document.createElement('div');
	tile.className = 'tile';
	const face = drawCardFace(card, { count: collection[card.id] || 0 });
	face.style.width = '100%';
	tile.appendChild(face);
	const badge = document.createElement('div');
	badge.className = 'badge';
	tile.appendChild(badge);
	tile.addEventListener('click', () => addCard(card.id));
	tileById.set(card.id, { tile, badge });
	return tile;
}
function refreshTile(id) {
	const t = tileById.get(id); if (!t) return;
	const used = inDeck(id), have = collection[id] || 0;
	t.tile.classList.toggle('depleted', used >= Math.min(have, limitOf(id)));
	t.badge.textContent = used ? `×${used}` : '';
	t.badge.style.display = used ? '' : 'none';
}

let renderToken = 0;
async function renderPage() {
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
	for (const s of slots) {
		const valid = Array.isArray(s.cards) && s.cards.length === SIZE;
		const div = document.createElement('div');
		div.className = 'slot-row' + (s.id === editingId ? ' active' : '');
		div.innerHTML = `<span class="s-name">${s.name || s.classId || 'Deck'}</span>`
			+ `<span class="s-meta">${(s.classId || '?').replace(/_/g, ' ')} · ${(s.cards || []).length}/${SIZE}${valid ? '' : ' ⚠'}</span>`;
		div.onclick = () => editSlot(s);
		list.appendChild(div);
	}
	$('delete-deck').style.display = editingId ? 'block' : 'none';
}
function renderDeckList() {
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
		row.onclick = () => removeCard(id);
		dl.appendChild(row);
	}
}
function updateCounts() {
	for (const id of tileById.keys()) refreshTile(id);
	renderDeckList();
	const full = deck.length === SIZE;
	$('deck-count').textContent = `${deck.length} / ${SIZE}`;
	$('deck-count').style.color = full ? '#57e389' : '#e8e2f4';
	$('toggle-deck').textContent = `DECK ${deck.length}/${SIZE}`;
	$('toggle-deck').style.background = full ? '#2f9e5e' : '#6b4fd4';
}

// ---------- switching decks ----------
function editSlot(slot) {
	editingId = slot.id;
	curClass = slot.classId || '';
	deck = [...slot.cards].filter(id => cardsById[id]);
	$('deck-name').value = slot.name || '';
	$('class-select').value = curClass;
	renderSlots(); applyFilters(); updateCounts();
	if (MOBILE.matches) $('deck-panel').classList.add('open');
}
function newDeck() {
	editingId = null;
	curClass = '';
	deck = [];
	$('deck-name').value = '';
	$('class-select').value = '';
	renderSlots(); applyFilters(); updateCounts();
}

// ---------- save / delete ----------
$('save').onclick = async () => {
	if (!myClass()) { flash('Choose a class first.'); return; }
	if (deck.length !== SIZE) { flash(`Decks must be exactly ${SIZE} cards (has ${deck.length}).`); return; }
	const name = ($('deck-name').value || '').trim() || `${myClass()} deck`;
	if (MP_ON) {
		const data = await MPX.call('save-deck', { id: editingId || undefined, name, classId: myClass(), deck });
		if (data.error) { flash(data.error); return; }
		mpState = data.state; slots = loadSlots();
		const match = slots.find(s => s.id === editingId) || slots[slots.length - 1];
		if (match) editingId = match.id;
		renderSlots(); flash('Deck saved — take it into card battles.');
		return;
	}
	const err = Col.validateDeck(deck, cardsById, collection, myClass());
	if (err) { flash(err); return; }
	if (editingId) {
		const s = slots.find(x => x.id === editingId);
		if (s) { s.name = name; s.classId = myClass(); s.cards = [...deck]; }
	} else {
		if (slots.length >= MAX_SLOTS) { flash(`All ${MAX_SLOTS} slots are full — delete one first.`); return; }
		const s = { id: newId(), name, classId: myClass(), cards: [...deck] };
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
	newDeck(); flash('Deck deleted.');
};
$('new-deck').onclick = () => newDeck();

// ---------- tabs, filters, pager, mobile toggle ----------
for (const btn of document.querySelectorAll('.tab')) {
	btn.addEventListener('click', () => {
		filters.tab = btn.dataset.tab;
		document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b === btn));
		applyFilters();
	});
}
$('search').addEventListener('input', ev => { filters.search = ev.target.value.toLowerCase(); applyFilters(); });
$('prev').addEventListener('click', () => flip(-1));
$('next').addEventListener('click', () => flip(1));
$('toggle-deck').addEventListener('click', () => $('deck-panel').classList.toggle('open'));
$('panel-close').addEventListener('click', () => $('deck-panel').classList.remove('open'));
MOBILE.addEventListener('change', () => { PAGE_SIZE = MOBILE.matches ? 9 : 15; renderPage(); });

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

// class picker: the FIRST choice
fetch('classes.json').then(r => r.json()).then(({ classes }) => {
	const sel = $('class-select');
	sel.innerHTML = '<option value="">— choose class —</option>';
	for (const c of classes) {
		const opt = document.createElement('option');
		opt.value = c.id; opt.textContent = c.name;
		sel.appendChild(opt);
	}
	sel.value = curClass;
	sel.addEventListener('change', ev => {
		curClass = ev.target.value;
		deck = curClass ? deck.filter(id => Col.fitsClass(cardsById[id], curClass)) : [];
		applyFilters(); updateCounts();
	});
}).catch(() => {});

// ---------- boot ----------
fetch('cards.json').then(r => r.json()).then(async data => {
	const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, special: 5 };
	cards = data.cards.filter(Col.collectible).slice().sort((a, b) =>
		(a.cost ?? 0) - (b.cost ?? 0)
		|| (rarityOrder[a.rarity || 'common'] - rarityOrder[b.rarity || 'common'])
		|| a.name.localeCompare(b.name));
	for (const d of data.cards) cardsById[d.id] = d;
	if (MP_ON) { mpState = await MPX.freshState(); collection = mpState?.collection || {}; }
	else { collection = Col.getCollection(data.cards); }
	slots = loadSlots();
	newDeck();
	window.__deck = { get deck() { return deck; }, get slots() { return slots; }, addCard, removeCard, editSlot, newDeck, Col };
});
