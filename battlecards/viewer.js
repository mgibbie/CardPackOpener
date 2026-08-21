// viewer.js — the collection browser: a paginated, filterable card book.
// Card faces come from the shared procedural renderer; rules text appears in
// a hover tooltip, and rules-cards carry a CSS-animated iridescent gem.
import { drawCardFace, classNameOf, canonClass, artListeners, preloadArt, showsRarity } from './cardart.js?v=20260856a';
import { keywordsFor, richHtml } from './keywords.js?v=20260856a';

// cache-busting: this module's own ?v=… (from viewer.html) is reused for the
// cards.json fetch so a version bump refreshes code and data together
const CB = new URL(import.meta.url).search;

// small keyword-explanation lines shown beneath a card's rules text
function keywordLinesHtml(card) {
	return keywordsFor(card).map(k => `<div class="tt-kw"><b>${k.label}</b> — ${k.text}</div>`).join('');
}

// repaint the visible page as real art crops stream in
let artRepaint = null;
artListeners.add(() => {
	clearTimeout(artRepaint);
	artRepaint = setTimeout(() => renderPage(), 120);
});
import * as Col from './collection.js';
import * as MPX from './mpmode.js';

// test-realm mode: the gallery is your account's collection, nothing more
const MP_ON = MPX.mpMode();

const MOBILE = matchMedia('(max-width: 760px)');
const TOUCH = matchMedia('(pointer: coarse)').matches;
let PAGE_SIZE = MOBILE.matches ? 6 : 10;
MOBILE.addEventListener('change', () => { PAGE_SIZE = MOBILE.matches ? 6 : 10; page = 0; renderPage(); });
let cards = [], collection = {}, filtered = [], page = 0;
const filters = { search: '', mana: null, type: '', rarity: '', cls: '', ownedOnly: false, showUncollectible: false };

// cards you can't collect: lands (bought from slots), tokens, hero powers,
// companions/commanders — hidden by default so the gallery is your card pool
const isUncollectible = c => c.token || c.companion || c.commander || c.collectible === false
	|| c.type === 'land' || c.type === 'plane' || c.type === 'heropower';

// uncollectible / system cards filter under their own buckets, not a class:
// all Lands, the five WUBRG colours (non-land), then a Generic catch-all
const SYSTEM_BUCKETS = [
	['__land__', 'Lands'], ['__advland__', 'Advanced Lands'],
	['__c_W__', 'White'], ['__c_U__', 'Blue'], ['__c_B__', 'Black'],
	['__c_R__', 'Red'], ['__c_G__', 'Green'], ['__generic__', 'Generic'],
	['__plane__', 'Planes'], ['__excavate__', 'Excavate'], ['__appendage__', 'Appendages'],
];
const SYSTEM_KEYS = new Set(SYSTEM_BUCKETS.map(b => b[0]));
// Land Sets: cards a land generates, tagged via `landSet`. These filter by the tag (a card can
// appear both here AND in its broad colour list). The 5 basics are named; anything else is advanced.
const BASIC_LAND_SETS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const lsKey = ls => '__ls_' + ls + '__';
const isLandSetKey = k => typeof k === 'string' && k.startsWith('__ls_');
// theme words an advanced land can conjure (matched against a card's name)
let advThemes = null;
function ensureAdvThemes(list) {
	if (advThemes) return;
	advThemes = new Set();
	for (const c of list) if (c.type === 'land') for (const tap of (c.taps || [])) for (const e of (tap.effects || []))
		if (e.type === 'conjure-named' && e.match) advThemes.add(e.match.toLowerCase());
}
function systemBucket(c) {
	if (c.excavate) return '__excavate__'; // excavate rewards (Azerite legendaries, …)
	if (c.colossalOf) return '__appendage__'; // Colossal appendage tokens
	if (c.type === 'land') return '__land__';
	if (c.type === 'plane') return '__plane__';
	if (c.type === 'emblem') return '__generic__'; // dungeon-run treasures / emblems
	if ((c.tribe || '').split(/\s+/).includes('Token')) return '__generic__'; // Token-tribe cards (Blood/Clue/Food/Treasure)
	if (c.id === 'coin' || c.id === 'banana') return '__generic__'; // neutral token spells
	const cols = c.colors || [];
	for (const col of ['W', 'U', 'B', 'R', 'G']) if (cols.includes(col)) return '__c_' + col + '__';
	if (canonClass(c.cardClass || 'neutral') === 'magepunk') {
		// paper cards a land conjures (name matches a theme) are Advanced Lands; the
		// rest (Blood Gem) are Generic
		const nm = (c.name || '').toLowerCase();
		if (advThemes) for (const t of advThemes) if (nm.includes(t)) return '__advland__';
		return '__generic__';
	}
	if (cols.includes('C')) return '__generic__';
	// any OTHER uncollectible (summon/conjure tokens, corrupted forms, boss
	// cards, ...) sorts under Generic instead of masquerading as a class card
	if (isUncollectible(c)) return '__generic__';
	return null;
}

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
$('show-uncollectible').addEventListener('change', ev => { filters.showUncollectible = ev.target.checked; page = 0; applyFilters(); });
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
		const cc = canonClass(c.cardClass || 'neutral');
		const sb = systemBucket(c);
		if (isLandSetKey(filters.cls)) { if (c.landSet !== filters.cls.slice(5, -2)) return false; } // Land Set: match the tag directly
		else if (SYSTEM_KEYS.has(filters.cls)) { if (sb !== filters.cls) return false; }
		else if (filters.cls === '__dual__') { if (sb || !cc.includes('__')) return false; }
		else if (filters.cls && (sb || cc !== filters.cls)) return false;
		if (filters.type && c.type !== filters.type) return false;
		if (filters.rarity && (c.rarity || 'common') !== filters.rarity) return false;
		if (filters.ownedOnly && !(collection[c.id] > 0)) return false;
		// hide uncollectible by default — unless you've picked one of their buckets
		if (!filters.showUncollectible && isUncollectible(c) && !SYSTEM_KEYS.has(filters.cls) && !isLandSetKey(filters.cls)) return false;
		return true;
	});
	$('count').textContent = `${filtered.length} of ${cards.length} cards`;
	renderPage();
}

function tileFor(card) {
	const tile = document.createElement('div');
	const owned = collection[card.id] || 0;
	tile.className = 'tile' + (owned ? '' : ' unowned');
	// keyboard-operable: a card tile acts as a button that opens the card detail
	tile.setAttribute('role', 'button');
	tile.tabIndex = 0;
	tile.setAttribute('aria-label', card.name + ' — view card');
	// the owned-copies count is drawn top-left on the card face itself
	const face = drawCardFace(card, { count: owned });
	face.style.width = '100%';
	tile.appendChild(face);
	if (!TOUCH) {
		tile.addEventListener('pointermove', ev => {
			tip.innerHTML = `<div class="tt-name">${card.name}</div><div class="tt-type">${typeLineOf(card)}</div>`
				+ `<div class="tt-desc">${richHtml(card.description || '')}</div>` + keywordLinesHtml(card);
			tip.style.display = 'block';
			tip.style.left = `${Math.min(ev.clientX + 18, innerWidth - 290)}px`;
			tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 12)}px`;
		});
		tile.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
	}
	tile.addEventListener('click', () => openZoom(card));
	tile.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openZoom(card); } });
	return tile;
}

function typeLineOf(card) {
	return classNameOf(card.cardClass).toUpperCase() + ' · ' + (card.tribe ? card.tribe + ' ' : '')
		+ card.type.toUpperCase() + (showsRarity(card) ? ' · ' + (card.rarity || 'common').toUpperCase() : '');
}

// tap/click a card for a big look with its full info
function openZoom(card) {
	tip.style.display = 'none';
	const holder = $('zoom-card');
	holder.innerHTML = '';
	const owned0 = collection[card.id] || 0;
	holder.appendChild(drawCardFace(card, { count: owned0 }));
	const stats = [];
	stats.push(`Cost ${card.cost ?? 0}`);
	if (card.type === 'creature') stats.push(`${card.attack}/${card.health}`);
	if (card.type === 'weapon') stats.push(`${card.attack} attack · ${card.durability} durability`);
	if (card.type === 'location') stats.push(`${card.durability} uses`);
	if (card.type === 'planeswalker') stats.push(`${card.loyalty} loyalty`);
	const owned = collection[card.id] || 0;
	$('zoom-info').innerHTML = `<div class="z-name">${card.name}</div>`
		+ `<div class="z-type">${typeLineOf(card)}</div>`
		+ `<div class="z-stats">${stats.join(' · ')}</div>`
		+ `<div class="z-desc">${card.description ? richHtml(card.description) : '<i>No rules text.</i>'}</div>`
		+ keywordLinesHtml(card)
		+ `<div class="z-owned">${owned ? `You own x${owned}` : 'Not in your collection yet'}</div>`;
	$('zoom').classList.add('open');
	// once the real art streams in, repaint the big face too
	setTimeout(() => {
		if ($('zoom').classList.contains('open') && holder.firstChild) {
			holder.innerHTML = '';
			holder.appendChild(drawCardFace(card));
		}
	}, 900);
}
$('zoom-close').addEventListener('click', () => $('zoom').classList.remove('open'));
$('zoom').addEventListener('click', ev => { if (ev.target.id === 'zoom') $('zoom').classList.remove('open'); });
addEventListener('keydown', ev => { if (ev.key === 'Escape') $('zoom').classList.remove('open'); });

let renderToken = 0;
async function renderPage() {
	tip.style.display = 'none';
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	page = Math.min(page, pages - 1);
	const pageCards = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
	$('prev').disabled = page === 0;
	$('next').disabled = page >= pages - 1;
	$('pageinfo').textContent = filtered.length ? `Page ${page + 1} / ${pages}` : 'No cards match those filters.';
	// load this page's art BEFORE drawing so cards appear complete (no artless
	// flash); keep the current page on screen until the new art is ready
	const token = ++renderToken;
	await preloadArt(pageCards.map(c => c.id));
	if (token !== renderToken) return; // superseded by a newer render
	grid.innerHTML = '';
	for (const card of pageCards) grid.appendChild(tileFor(card));
}

fetch('cards.json' + CB)
	.then(r => r.json())
	.then(async data => {
		let mpOwned = null;
		if (MP_ON) {
			const s = await MPX.freshState();
			mpOwned = s?.collection || {};
			data.cards = data.cards.filter(d => mpOwned[d.id] > 0);
		}
		// class filter: single classes (Neutral last) + a combined "Dual" bucket, then
		// the uncollectible/system buckets (Lands, Advanced Lands, WUBRG colours,
		// Generic). System cards are pulled out of their class so options stay clean.
		ensureAdvThemes(data.cards);
		const nonSystem = data.cards.filter(c => !systemBucket(c));
		const singles = [...new Set(nonSystem.map(c => canonClass(c.cardClass || 'neutral')).filter(c => !c.includes('__')))]
			.sort((a, b) => a.localeCompare(b));
		const classes = singles.filter(c => c !== 'neutral');
		if (nonSystem.some(c => canonClass(c.cardClass || 'neutral').includes('__'))) classes.push('__dual__');
		if (singles.includes('neutral')) classes.push('neutral');
		for (const cls of classes) {
			const opt = document.createElement('option');
			opt.value = cls;
			opt.textContent = cls === '__dual__' ? 'Dual' : classNameOf(cls);
			$('class-filter').appendChild(opt);
		}
		for (const [key, label] of SYSTEM_BUCKETS) {
			if (!data.cards.some(c => systemBucket(c) === key)) continue;
			const opt = document.createElement('option');
			opt.value = key;
			opt.textContent = label;
			$('class-filter').appendChild(opt);
		}
		// Land Sets — two grouped lists-of-lists, by the `landSet` tag
		const landSets = [...new Set(data.cards.map(c => c.landSet).filter(Boolean))];
		const addLandGroup = (label, sets) => {
			if (!sets.length) return;
			const og = document.createElement('optgroup');
			og.label = label;
			for (const ls of sets) { const o = document.createElement('option'); o.value = lsKey(ls); o.textContent = ls; og.appendChild(o); }
			$('class-filter').appendChild(og);
		};
		addLandGroup('Basic Land Sets', BASIC_LAND_SETS.filter(ls => landSets.includes(ls)));
		addLandGroup('Advanced Land Sets', landSets.filter(ls => !BASIC_LAND_SETS.includes(ls)).sort());
		const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4, special: 5 };
		cards = data.cards.slice().sort((a, b) =>
			(a.cost ?? 0) - (b.cost ?? 0)
			|| (rarityOrder[a.rarity || 'common'] - rarityOrder[b.rarity || 'common'])
			|| a.name.localeCompare(b.name));
		collection = mpOwned || Col.getCollection(data.cards);
		applyFilters();
	});
