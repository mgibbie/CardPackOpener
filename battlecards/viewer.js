// viewer.js — the collection browser: a paginated, filterable card book.
// Card faces come from the shared procedural renderer; rules text appears in
// a hover tooltip, and rules-cards carry a CSS-animated iridescent gem.
import { drawCardFace, hasRules, classNameOf, artListeners } from './cardart.js';

// repaint the visible page as real art crops stream in
let artRepaint = null;
artListeners.add(() => {
	clearTimeout(artRepaint);
	artRepaint = setTimeout(() => renderPage(), 120);
});
import * as Col from './collection.js';

const PAGE_SIZE = 10;
let cards = [], collection = {}, filtered = [], page = 0;
const filters = { search: '', mana: null, type: '', rarity: '', cls: '', ownedOnly: false };

const $ = id => document.getElementById(id);
const grid = $('grid');
const tip = $('tip');

// mana crystal filter row: 0..6 and 7+
const crystals = [];
for (let i = 0; i <= 7; i++) {
	const b = document.createElement('button');
	b.className = 'crystal';
	b.textContent = i === 7 ? '7+' : String(i);
	b.addEventListener('click', () => {
		filters.mana = filters.mana === i ? null : i;
		crystals.forEach((c, j) => c.classList.toggle('on', filters.mana === j));
		page = 0;
		applyFilters();
	});
	$('mana-row').appendChild(b);
	crystals.push(b);
}

$('search').addEventListener('input', ev => { filters.search = ev.target.value.toLowerCase(); page = 0; applyFilters(); });
$('class-filter').addEventListener('change', ev => { filters.cls = ev.target.value; page = 0; applyFilters(); });
$('type-filter').addEventListener('change', ev => { filters.type = ev.target.value; page = 0; applyFilters(); });
$('rarity-filter').addEventListener('change', ev => { filters.rarity = ev.target.value; page = 0; applyFilters(); });
$('owned-only').addEventListener('change', ev => { filters.ownedOnly = ev.target.checked; page = 0; applyFilters(); });
$('prev').addEventListener('click', () => flip(-1));
$('next').addEventListener('click', () => flip(1));
addEventListener('keydown', ev => {
	if (ev.key === 'ArrowLeft') flip(-1);
	if (ev.key === 'ArrowRight') flip(1);
});

function flip(d) {
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	page = Math.max(0, Math.min(pages - 1, page + d));
	renderPage();
}

function applyFilters() {
	filtered = cards.filter(c => {
		if (filters.search && !(`${c.name} ${c.description || ''} ${c.type}`.toLowerCase().includes(filters.search))) return false;
		if (filters.mana != null) {
			const cost = c.cost ?? 0;
			if (filters.mana === 7 ? cost < 7 : cost !== filters.mana) return false;
		}
		if (filters.cls && (c.cardClass || 'neutral') !== filters.cls) return false;
		if (filters.type && c.type !== filters.type) return false;
		if (filters.rarity && (c.rarity || 'common') !== filters.rarity) return false;
		if (filters.ownedOnly && !(collection[c.id] > 0)) return false;
		return true;
	});
	$('count').textContent = `${filtered.length} of ${cards.length} cards`;
	renderPage();
}

function tileFor(card) {
	const tile = document.createElement('div');
	const owned = collection[card.id] || 0;
	tile.className = 'tile' + (owned ? '' : ' unowned');
	const face = drawCardFace(card);
	face.style.width = '100%';
	tile.appendChild(face);
	if (hasRules(card)) {
		const gem = document.createElement('div');
		gem.className = 'gemfx';
		tile.appendChild(gem);
	}
	if (owned) {
		const badge = document.createElement('div');
		badge.className = 'owned';
		badge.textContent = `x${owned}`;
		tile.appendChild(badge);
	}
	tile.addEventListener('pointermove', ev => {
		const typeLine = classNameOf(card.cardClass).toUpperCase() + ' · ' + (card.tribe ? card.tribe + ' ' : '') + card.type.toUpperCase()
			+ ' · ' + (card.rarity || 'common').toUpperCase();
		tip.innerHTML = `<div class="tt-name">${card.name}</div><div class="tt-type">${typeLine}</div>`
			+ `<div class="tt-desc">${card.description || ''}</div>`;
		tip.style.display = 'block';
		tip.style.left = `${Math.min(ev.clientX + 18, innerWidth - 290)}px`;
		tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 12)}px`;
	});
	tile.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
	return tile;
}

function renderPage() {
	grid.innerHTML = '';
	tip.style.display = 'none';
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	page = Math.min(page, pages - 1);
	for (const card of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
		grid.appendChild(tileFor(card));
	}
	$('prev').disabled = page === 0;
	$('next').disabled = page >= pages - 1;
	$('pageinfo').textContent = filtered.length ? `Page ${page + 1} / ${pages}` : 'No cards match those filters.';
}

fetch('cards.json')
	.then(r => r.json())
	.then(data => {
		// class filter options, in play-set order with Neutral last
		const classes = [...new Set(data.cards.map(c => c.cardClass || 'neutral'))]
			.sort((a, b) => (a === 'neutral') - (b === 'neutral') || a.localeCompare(b));
		for (const cls of classes) {
			const opt = document.createElement('option');
			opt.value = cls;
			opt.textContent = classNameOf(cls);
			$('class-filter').appendChild(opt);
		}
		const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, special: 5 };
		cards = data.cards.slice().sort((a, b) =>
			(a.cost ?? 0) - (b.cost ?? 0)
			|| (rarityOrder[a.rarity || 'common'] - rarityOrder[b.rarity || 'common'])
			|| a.name.localeCompare(b.name));
		collection = Col.getCollection(data.cards);
		applyFilters();
	});
