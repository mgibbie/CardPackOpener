// cardart.js — canvas-generated card faces shared by the game board, packs,
// deck builder, and gallery. Everything here is drawn procedurally: the frame
// layout follows collectible-card conventions (mana gem top-right, name banner,
// art window, rarity gem, stat plates) but every pixel is ours. Rules text is
// printed in a tan text box (keywords bold); the gallery shows an owned-copies
// badge in the top-left corner.
import * as THREE from 'three';
import { richTokens } from './keywords.js';
import { DUNGEONS } from './engine/dungeons.js';

export const CARD_W = 2.5, CARD_H = 3.5, CARD_D = 0.02;

export const RARITY_COLORS = {
	common:   '#9aa0a6',
	uncommon: '#4caf50',
	rare:     '#2196f3',
	epic:     '#9c27b0',
	legendary:'#ff9800',
	special:  '#e8d56f',
};
// class tints the card BODY; type still colors the banner and border
export const CLASS_COLORS = {
	neutral:       '#5c554b',
	bounty_hunter: '#9a5426',
	centurion:     '#256d76',
	naturalist:    '#7a8a2e',
	mage:          '#3172b5',
	shaman:        '#243a8a',
	paladin:       '#a3822a',
	warlock:       '#5e2d8a',
	hunter:        '#3f7a2b',
	rogue:         '#43414f',
	warrior:       '#8a2626',
	priest:        '#8f8ba0',
	druid:         '#6b4a26',
	// paper-set classes
	magepunk:      '#6b56c2',
	death_knight:  '#3e6a75',
	demon_hunter:  '#295c46',
	sorcerer:      '#7a2e5c',
	wizard:        '#5a4ab5',
	bard:          '#a05a8c',
	barbarian:     '#b04a3a',
	ranger:        '#3d8a6b',
};

// a few near-duplicate class tags in the card data fold onto their real class,
// so they name / colour / group together instead of splitting off
const CLASS_ALIASES = {
	demon_hunter_free: 'demon_hunter', demonhunter_free: 'demon_hunter', demonhunter: 'demon_hunter',
	deathknight: 'death_knight',
};
export function canonClass(cls) {
	const c = cls || 'neutral';
	if (CLASS_ALIASES[c]) return CLASS_ALIASES[c];
	return c.split('__').map(p => CLASS_ALIASES[p] || p).join('__'); // fold inside dual combos too
}

// dual classes ('druid__priest') fall back to their first class's color
export function classColorOf(cls) {
	const c = canonClass(cls);
	return CLASS_COLORS[c] || CLASS_COLORS[c.split('__')[0]] || CLASS_COLORS.neutral;
}
// WUBRG-coloured cards tint their frame body with the colour's identity rather
// than the neutral class brown (White reads as a pale ivory/silver frame).
const COLOR_BODY = { W: '#ece7d4', U: '#356fb8', B: '#3c3742', R: '#b23a2c', G: '#3f8038' };
// Lorequest dungeon-run cards (Middle-earth / Sword Coast / Final Fantasy /
// Multiverse) are grouped by HERO but built from real MTG cards of mixed WUBRG
// colours, so a hero's card pool read as a rainbow. Each hero deck is a single
// class, so colour these by CLASS instead — the pool becomes one cohesive colour.
const LORE_VARIANT_TAGS = ['meDeck', 'meSide', 'scDeck', 'scSide', 'ffDeck', 'ffSide', 'mvDeck', 'mvSide'];
export function bodyColorOf(card) {
	if (card && card.passive) return '#7a5a1e'; // passive treasures wear a gold treasure frame
	if (card && LORE_VARIANT_TAGS.some(t => card[t])) return classColorOf(card.cardClass);
	const cols = (card && card.colors) || [];
	for (const k of ['W', 'U', 'B', 'R', 'G']) if (COLOR_BODY[k] && cols.includes(k)) return COLOR_BODY[k];
	return classColorOf(card && card.cardClass);
}
// uncollectible cards (tokens, lands, planes, emblems, hero powers, the WUBRG /
// paper system cards) carry no meaningful rarity, so they show no rarity gem
export function isUncollectible(card) {
	if (!card) return false;
	if (card.token || card.companion || card.commander || card.collectible === false) return true;
	const t = card.type;
	if (t === 'land' || t === 'plane' || t === 'emblem' || t === 'heropower' || t === 'hero') return true;
	if ((card.colors || []).length) return true;              // WUBRG / colourless system cards
	if (canonClass(card.cardClass) === 'magepunk') return true; // paper conjured (Blood Gem, Advanced Lands)
	return false;
}
// ---------- generated-card relations ----------
// Which OTHER cards does this card create? Scanned from its definition:
// every id-bearing effect field (summons, conjures, shuffles, equips,
// transforms, Colossal appendages, Corrupt forms, hero-power grants, ...).
// Used by the in-game inspect, the gallery, and the wiki card pages.
const GENERATES_KEYS = new Set(['id', 'ids', 'summonId', 'intoId', 'into',
	'tokenId', 'cardId', 'powerId', 'portal', 'launchTransform', 'corrupt', 'colossal']);
export function generatedCardIds(card, byId) {
	const out = new Set();
	const walk = (v, key) => {
		if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
		if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, k); return; }
		if (typeof v === 'string' && GENERATES_KEYS.has(key) && v !== card.id && byId[v]) out.add(v);
	};
	for (const [k, v] of Object.entries(card)) if (k !== 'id') walk(v, k);
	return [...out];
}
// reverse index: cardId -> ids of every card that generates it (built once)
let _createdBy = null;
export function createdByIds(cardId, byId) {
	if (!_createdBy) {
		_createdBy = {};
		for (const c of Object.values(byId)) {
			for (const g of generatedCardIds(c, byId)) (_createdBy[g] = _createdBy[g] || []).push(c.id);
		}
	}
	return _createdBy[cardId] || [];
}
// most uncollectible cards have no meaningful rarity, but excavate rewards
// (the Azerite class legendaries etc.) keep their rarity gem + label
export function showsRarity(card) {
	return !!card && (card.excavate === true || !isUncollectible(card));
}
export function classNameOf(cls) {
	const c = canonClass(cls);
	if (CLASS_NAMES[c]) return CLASS_NAMES[c];
	return c.split('__')
		.map(p => p.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '))
		.join('/');
}
export const CLASS_NAMES = {
	neutral: 'Neutral', bounty_hunter: 'Bounty Hunter', centurion: 'Centurion',
	naturalist: 'Naturalist', mage: 'Mage', shaman: 'Shaman', paladin: 'Paladin',
	warlock: 'Warlock', hunter: 'Hunter', rogue: 'Rogue', warrior: 'Warrior',
	priest: 'Priest', druid: 'Druid',
};
export const TYPE_COLORS = {
	creature:    '#7a3b2e',
	sorcery:     '#5b3b8c',
	instant:     '#2e6a7a',
	land:        '#3b7a2e',
	artifact:    '#6e6a5e',
	enchantment: '#7a2e6a',
	weapon:      '#7a5a2e',
	secret:      '#2e6a4a',
	trap:        '#8a4a2e',
	heropower:   '#2e5a7a',
	quest:       '#7a6a2e',
	planeswalker:'#5a2e7a',
	location:    '#2e7a5e',
	emblem:      '#8a7a3a',
};

// where the rules gem sits on the face, in UV terms (for the 3D glow overlay)
export const RULES_GEM = { x: 0.5, y: 560 / 716, r: 60 / 512 };

// vanilla bodies get an empty socket area; anything with actual rules gets the gem
export function hasRules(card) {
	const d = (card.description || '').trim();
	if (!d) return false;
	return !/^A \d+\/\d+ (creature|weapon)\.$/.test(d);
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function shade(hex, f) {
	const n = parseInt(hex.slice(1), 16);
	const ch = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * f)));
	return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function hashId(id) {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// ---------- real card art (crops from the user's paper scans) ----------
// art/index.json lists ids with a real crop; everything else stays
// procedural. Images load lazily; listeners fire so live faces refresh.
// Resolve art relative to THIS module (battlecards/art/) so faces render the
// same whether the importer is the game or the design wiki in another folder.
const ART_DIR = new URL('art/', import.meta.url).href; // relative path — 302-redirects to the offload in prod, serves local files in dev
// Card art lives on the magepunk-cardart offload project (see /_redirects). On a
// DEPLOYED host we request it directly to skip the 302 hop the /battlecards/art/*
// redirect would add to every image on a cold cache; local dev keeps the relative
// path (its own files). If the direct host ever fails, image loads fall back to
// ART_DIR (the redirect) once — so the worst case is exactly the old behavior.
const _artLocal = typeof location === 'undefined' || location.protocol === 'file:'
	|| /^(localhost$|127\.|0\.0\.0\.0$|\[?::1)/.test(location.hostname);
const ART_BASE = _artLocal ? ART_DIR : 'https://magepunk-cardart.pages.dev/';
// per-image cache-bust: art jpgs cache hard (7 days) on the host, so a re-cropped/retinted image
// keeps serving stale to returning visitors. Bump an entry here (only for CHANGED art) to force a
// fresh fetch of just that image — the other ~11k stay cached.
// per-image cache-bust (?v=N) — bump when an <id>.jpg is re-cropped/replaced so the 7-day CDN
// cache doesn't serve the stale image. The mv_* entries are the 95 Multiverse cards whose art was
// replaced when their conflicting names were changed.
const ART_REVS = { chrome_cat: 2, mv_cap_4: 2, mv_e_abomination_10: 2, mv_e_abomination_2: 2, mv_e_abomination_3: 2, mv_e_abomination_4: 2, mv_e_abomination_6: 2, mv_e_abomination_7: 2, mv_e_abomination_8: 2, mv_e_abomination_9: 2, mv_e_carnage_7: 2, mv_e_doom_4: 2, mv_e_doom_6: 2, mv_e_doom_7: 2, mv_e_electro_6: 2, mv_e_electro_7: 2, mv_e_electro_8: 2, mv_e_galactus_2: 2, mv_e_galactus_3: 2, mv_e_galactus_6: 2, mv_e_galactus_7: 2, mv_e_hobgoblin_10: 2, mv_e_hobgoblin_2: 2, mv_e_hobgoblin_3: 2, mv_e_hobgoblin_5: 2, mv_e_hobgoblin_7: 2, mv_e_hobgoblin_8: 2, mv_e_hobgoblin_9: 2, mv_e_kang_10: 2, mv_e_kang_2: 2, mv_e_kang_3: 2, mv_e_kang_5: 2, mv_e_kang_7: 2, mv_e_kingpin_3: 2, mv_e_kingpin_4: 2, mv_e_kingpin_6: 2, mv_e_kingpin_7: 2, mv_e_kingpin_9: 2, mv_e_kraven_10: 2, mv_e_kraven_3: 2, mv_e_kraven_5: 2, mv_e_kraven_6: 2, mv_e_kraven_7: 2, mv_e_kraven_9: 2, mv_e_lizard_10: 2, mv_e_lizard_4: 2, mv_e_lizard_5: 2, mv_e_lizard_7: 2, mv_e_lizard_8: 2, mv_e_loki_10: 2, mv_e_loki_2: 2, mv_e_loki_3: 2, mv_e_loki_7: 2, mv_e_loki_8: 2, mv_e_loki_9: 2, mv_e_mysterio_2: 2, mv_e_mysterio_3: 2, mv_e_mysterio_5: 2, mv_e_rhino_10: 2, mv_e_rhino_2: 2, mv_e_rhino_3: 2, mv_e_rhino_4: 2, mv_e_rhino_7: 2, mv_e_sandman_10: 2, mv_e_sandman_2: 2, mv_e_sandman_3: 2, mv_e_sandman_6: 2, mv_e_sandman_7: 2, mv_e_sandman_9: 2, mv_e_scorpion_2: 2, mv_e_scorpion_4: 2, mv_e_scorpion_6: 2, mv_e_scorpion_7: 2, mv_e_scorpion_8: 2, mv_e_scorpion_9: 2, mv_e_shocker_10: 2, mv_e_shocker_5: 2, mv_e_shocker_6: 2, mv_e_shocker_7: 2, mv_e_shocker_8: 2, mv_e_thanos_2: 2, mv_e_thanos_3: 2, mv_e_thanos_5: 2, mv_e_thanos_6: 2, mv_e_thanos_7: 2, mv_e_venom_10: 2, mv_e_vulture_10: 2, mv_e_vulture_3: 2, mv_e_vulture_4: 2, mv_e_vulture_5: 2, mv_e_vulture_6: 2, mv_marvel_3: 2, mv_marvel_5: 2, mv_storm_5: 2, mv_storm_6: 2, mv_thor_6: 2, sauron_lord_of_the_rings: 2 };
const artUrl = id => ART_BASE + id + '.jpg' + (ART_REVS[id] ? '?v=' + ART_REVS[id] : '');
function withArtFallback(img, id) {
	if (ART_BASE === ART_DIR) return img; // already the relative fallback path
	img.addEventListener('error', () => { img.src = ART_DIR + id + '.jpg'; }, { once: true });
	return img;
}
let artIndex = null;
const artImgs = new Map(); // id -> HTMLImageElement
export const artListeners = new Set(); // fn(id) called when an image (or the mana font) arrives

// Per-card art framing, hand-tuned in arttune.html: { id: {z, fx, fy} } where
// z >= 1 zooms past the cover fit and fx/fy (0..1) pick the focal point kept
// centered. Sparse — untuned cards keep the plain centered cover fit. The map
// is a live singleton (the tuner mutates it for instant preview); when the
// committed file arrives, every live face repaints via artListeners('*').
export const ART_TUNING = {};
const _tuneBase = (() => { try { return new URL('.', import.meta.url).href; } catch (e) { return ''; } })();
// committed file first, then the server override on top (per card id) — the
// override is what the owner saves from the LIVE arttune page, so a phone-side
// save takes effect for everyone without a deploy
const _mpCall = body => fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
	.then(r => (r.ok ? r.json() : {}));
Promise.allSettled([
	fetch(_tuneBase + 'art_tuning.json').then(r => (r.ok ? r.json() : {})),
	_mpCall({ action: 'tuning-get' }),
]).then(([f, o]) => {
	const got = o.value || {};
	Object.assign(ART_TUNING, f.value || {}, got.art || {});
	if (Object.keys(ART_TUNING).length) for (const fn of artListeners) fn('*');
	// live replacement IMAGES (saved from arttune on the live site, pending a
	// fold into battlecards/art/) — pull each and slot it in as an override
	for (const id of got.artIds || []) {
		if (!/^[a-z0-9_]+$/.test(id)) continue;
		_mpCall({ action: 'art-fetch', id }).then(d => {
			if (!d.dataUrl) return;
			const img = new Image();
			img.onload = () => setArtOverride(id, img);
			img.src = d.dataUrl;
		}).catch(() => {});
	}
});
// does this id have real art? (the tuner only lists tunable cards)
export function hasArt(id) { return !!(artIndex && artIndex.has(id)); }
export { artIndexReady };

// arttune.html: preview a replacement image before it's saved. The override
// slots straight into the normal art cache so every painter picks it up, and
// the id joins the index so a previously art-less card renders it too.
export function setArtOverride(id, img) {
	artImgs.set(id, img);
	if (artIndex) artIndex.add(id);
	for (const fn of artListeners) fn(id);
}

// the Mana font (Andrew Gioia, OFL) so card faces can draw real MTG symbols.
// Its glyph codepoints + the authentic 'cost' circle colours; we load the font
// then repaint every face (artListeners('*')) so the pips upgrade in place.
const MANA_CP = { tap: 0xe61a, W: 0xe600, U: 0xe601, B: 0xe602, R: 0xe603, G: 0xe604, C: 0xe904 };
const MANA_BG = { tap: '#cececa', W: '#f0f2c0', U: '#b5cde3', B: '#aca29a', R: '#db8664', G: '#93b483', C: '#ccc5b9', N: '#ccc5b9' };
let manaReady = false;
if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
	const ff = new FontFace('Mana', 'url(/battlecards/vendor/mana.woff2) format("woff2")'); // self-hosted: no third-party CDN on the card-render path
	ff.load().then(f => { document.fonts.add(f); manaReady = true; for (const fn of artListeners) fn('*'); }).catch(() => {});
}

// cache-bust index.json with THIS module's ?v (the gallery/wiki import cardart.js with
// a version query) so a release refreshes the art index — otherwise a returning visitor
// keeps a stale index that omits newly-added art ids and shows procedural faces for them
const _artCb = (() => { try { return new URL(import.meta.url).search; } catch (e) { return ''; } })();
// {cache:'no-cache'} revalidates the index every load, so pages that import cardart.js
// WITHOUT a ?v (news, in-game, packs) still pick up newly-added art ids, not a stale index
const artIndexReady = fetch(ART_BASE + 'index.json' + _artCb, { cache: 'no-cache' })
	.then(r => (r.ok ? r.json() : Promise.reject()))
	.catch(() => fetch(ART_DIR + 'index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : []))) // fall back to the redirect path
	.then(ids => { artIndex = new Set(ids); })
	.catch(() => { artIndex = new Set(); });

function artFor(id) {
	if (!artIndex || !artIndex.has(id)) return null;
	let img = artImgs.get(id);
	if (!img) {
		img = new Image();
		img.crossOrigin = 'anonymous'; // art is served cross-origin (magepunk-cardart project) — keep the canvas untainted
		img.onload = () => { for (const fn of artListeners) fn(id); };
		withArtFallback(img, id);
		img.src = artUrl(id);
		artImgs.set(id, img);
	}
	return img.complete && img.naturalWidth ? img : null;
}

// wait until the real art for these cards is fully loaded, so a consumer can
// draw the card complete (with its art) instead of flashing the procedural
// fallback first. Resolves immediately for cards that have no crop.
export async function preloadArt(ids) {
	await artIndexReady;
	await Promise.all([...new Set(ids)].map(id => new Promise(res => {
		if (!artIndex.has(id)) return res();
		let img = artImgs.get(id);
		if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; withArtFallback(img, id); img.src = artUrl(id); artImgs.set(id, img); }
		if (img.complete) return res();
		img.addEventListener('load', () => { for (const fn of artListeners) fn(id); res(); }, { once: true });
		img.addEventListener('error', () => res(), { once: true });
	})));
}

// an original gold coin, drawn for The Coin
function paintCoin(ctx, x, y, w, h) {
	const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.34;
	// warm vault backdrop
	const bg = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, Math.max(w, h) * 0.7);
	bg.addColorStop(0, '#3a2f14');
	bg.addColorStop(1, '#160f06');
	ctx.fillStyle = bg;
	ctx.fillRect(x, y, w, h);
	// scattered sparkle
	for (let i = 0; i < 14; i++) {
		const a = i * 2.399, rr = r * (1.2 + (i % 5) * 0.28);
		ctx.fillStyle = `rgba(255,225,150,${0.18 + (i % 3) * 0.12})`;
		ctx.beginPath();
		ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, 2 + (i % 3), 0, Math.PI * 2);
		ctx.fill();
	}
	// coin body
	const gold = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
	gold.addColorStop(0, '#fff4c2');
	gold.addColorStop(0.45, '#f2c94c');
	gold.addColorStop(0.85, '#c8962a');
	gold.addColorStop(1, '#8a5f18');
	ctx.fillStyle = gold;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	// rim
	ctx.lineWidth = r * 0.12;
	ctx.strokeStyle = '#a9781f';
	ctx.stroke();
	ctx.lineWidth = r * 0.04;
	ctx.strokeStyle = 'rgba(255,240,190,0.7)';
	ctx.beginPath();
	ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
	ctx.stroke();
	// embossed mana crystal in the centre
	ctx.save();
	ctx.translate(cx, cy);
	const gem = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
	gem.addColorStop(0, '#bfe0ff');
	gem.addColorStop(0.5, '#3f8fe0');
	gem.addColorStop(1, '#14508f');
	ctx.fillStyle = gem;
	ctx.beginPath();
	ctx.moveTo(0, -r * 0.52);
	ctx.lineTo(r * 0.34, -r * 0.1);
	ctx.lineTo(0, r * 0.52);
	ctx.lineTo(-r * 0.34, -r * 0.1);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = 'rgba(10,30,60,0.6)';
	ctx.lineWidth = r * 0.05;
	ctx.stroke();
	ctx.restore();
	// top-left glint
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.beginPath();
	ctx.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2);
	ctx.fill();
}

// emblems (dungeon-run treasures) have no photo art — draw a glowing runed
// medallion, tinted + glyph-varied per card so each reads as its own treasure
function paintEmblem(ctx, card, x, y, w, h) {
	const seed = hashId(card.id || card.name || '?');
	let s = seed >>> 0;
	const rand = () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const hue = seed % 360;
	const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.34;

	// dark radial vault backdrop
	const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * 0.7);
	bg.addColorStop(0, `hsl(${hue}, 45%, 20%)`);
	bg.addColorStop(1, `hsl(${(hue + 30) % 360}, 55%, 6%)`);
	ctx.fillStyle = bg;
	ctx.fillRect(x, y, w, h);

	// radiating light shafts
	ctx.save();
	ctx.translate(cx, cy);
	const rays = 12 + (seed % 6);
	for (let i = 0; i < rays; i++) {
		ctx.rotate((Math.PI * 2) / rays);
		ctx.fillStyle = `hsla(${(hue + 40) % 360}, 85%, 70%, ${0.05 + rand() * 0.05})`;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(-w * 0.5, -9);
		ctx.lineTo(-w * 0.5, 9);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();

	// halo glow
	const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.9);
	halo.addColorStop(0, `hsla(${(hue + 50) % 360}, 90%, 70%, 0.5)`);
	halo.addColorStop(1, 'hsla(0,0%,0%,0)');
	ctx.fillStyle = halo;
	ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, Math.PI * 2); ctx.fill();

	// gold metallic outer ring
	ctx.lineWidth = R * 0.16;
	const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
	ring.addColorStop(0, '#f7e39b'); ring.addColorStop(0.5, '#b8892f'); ring.addColorStop(1, '#f2d178');
	ctx.strokeStyle = ring;
	ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

	// enamelled inner disc in the card's hue
	const disc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
	disc.addColorStop(0, `hsl(${hue}, 70%, 56%)`);
	disc.addColorStop(1, `hsl(${(hue + 20) % 360}, 65%, 26%)`);
	ctx.fillStyle = disc;
	ctx.beginPath(); ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2); ctx.fill();

	// central rune (one of five, chosen by seed) in bright metal
	ctx.save();
	ctx.translate(cx, cy);
	ctx.strokeStyle = '#fff4d6'; ctx.fillStyle = '#fff4d6';
	ctx.lineWidth = R * 0.11; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
	ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6;
	const gr = R * 0.5, glyph = (seed >> 5) % 5;
	if (glyph === 0) {                 // five-point star
		ctx.beginPath();
		for (let i = 0; i < 5; i++) {
			const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
			ctx.lineTo(Math.cos(a) * gr, Math.sin(a) * gr);
			const a2 = a + Math.PI / 5;
			ctx.lineTo(Math.cos(a2) * gr * 0.45, Math.sin(a2) * gr * 0.45);
		}
		ctx.closePath(); ctx.fill();
	} else if (glyph === 1) {           // compass cross
		ctx.beginPath(); ctx.moveTo(0, -gr); ctx.lineTo(0, gr); ctx.moveTo(-gr, 0); ctx.lineTo(gr, 0); ctx.stroke();
		ctx.beginPath(); ctx.arc(0, 0, gr * 0.34, 0, Math.PI * 2); ctx.stroke();
	} else if (glyph === 2) {           // triangle sigil
		ctx.beginPath();
		for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; ctx.lineTo(Math.cos(a) * gr, Math.sin(a) * gr); }
		ctx.closePath(); ctx.stroke();
		ctx.beginPath(); ctx.arc(0, 0, gr * 0.24, 0, Math.PI * 2); ctx.fill();
	} else if (glyph === 3) {           // watching eye
		ctx.beginPath(); ctx.ellipse(0, 0, gr, gr * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
		ctx.beginPath(); ctx.arc(0, 0, gr * 0.3, 0, Math.PI * 2); ctx.fill();
	} else {                            // angular rune
		ctx.beginPath();
		ctx.moveTo(0, -gr); ctx.lineTo(0, gr);
		ctx.moveTo(0, -gr * 0.4); ctx.lineTo(gr * 0.6, -gr * 0.8);
		ctx.moveTo(0, gr * 0.1); ctx.lineTo(-gr * 0.6, -gr * 0.3);
		ctx.stroke();
	}
	ctx.restore();

	// orbiting sparkles
	for (let i = 0; i < 6; i++) {
		ctx.fillStyle = `hsla(${(hue + 60) % 360}, 90%, 85%, ${0.5 + rand() * 0.4})`;
		const a = rand() * Math.PI * 2, rr = R * (1.2 + rand() * 0.6);
		ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5 + rand() * 2.5, 0, Math.PI * 2); ctx.fill();
	}
}

// deterministic per-card generative art, painted inside the art window clip
function paintArt(ctx, card, x, y, w, h) {
	// real art wins when it's ready: cover-fit the crop into the window,
	// then apply the card's hand-tuned framing ({z, fx, fy} — see ART_TUNING)
	const img = artFor(card.id);
	if (img) {
		const t = ART_TUNING[card.id];
		const z = Math.max(1, t?.z || 1); // z < 1 would break the cover fit (gaps)
		const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * z;
		const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
		// keep the focal point (image-space, 0..1) centered in the window, but
		// never slide the crop far enough to uncover an edge
		const fx = t?.fx ?? 0.5, fy = t?.fy ?? 0.5;
		const dx = Math.min(x, Math.max(x + w - dw, x + w / 2 - fx * dw));
		const dy = Math.min(y, Math.max(y + h - dh, y + h / 2 - fy * dh));
		ctx.drawImage(img, dx, dy, dw, dh);
		return;
	}
	// The Coin: an original procedurally-drawn gold coin (no external art)
	if (card.id === 'coin') { paintCoin(ctx, x, y, w, h); return; }
	// dungeon-run emblems: a glowing runed medallion instead of a landscape
	if (card.type === 'emblem') { paintEmblem(ctx, card, x, y, w, h); return; }
	const seed = hashId(card.id || card.name || '?');
	// mulberry32: deterministic per card, always in [0, 1)
	const rand = (() => {
		let s = seed >>> 0;
		return () => {
			s = (s + 0x6D2B79F5) >>> 0;
			let t = Math.imul(s ^ (s >>> 15), 1 | s);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	})();
	const hue = seed % 360;
	const typeCol = TYPE_COLORS[card.type] || '#444';

	// sky
	const sky = ctx.createLinearGradient(x, y, x, y + h);
	sky.addColorStop(0, `hsl(${hue}, 60%, 52%)`);
	sky.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 22%)`);
	ctx.fillStyle = sky;
	ctx.fillRect(x, y, w, h);

	const variant = (seed >> 4) % 4;
	if (variant === 0) {
		// desert peaks under a sun
		ctx.fillStyle = `hsla(${(hue + 180) % 360}, 70%, 72%, 0.9)`;
		ctx.beginPath();
		ctx.arc(x + w * (0.3 + rand() * 0.4), y + h * 0.3, 26 + rand() * 22, 0, Math.PI * 2);
		ctx.fill();
		for (let i = 0; i < 3; i++) {
			ctx.fillStyle = `hsla(${hue}, 42%, ${34 - i * 8}%, 0.95)`;
			ctx.beginPath();
			const base = y + h * (0.62 + i * 0.13);
			ctx.moveTo(x - 10, y + h + 10);
			for (let px = 0; px <= 6; px++) {
				ctx.lineTo(x + (w * px) / 6, base - (px % 2 ? 30 + rand() * 55 : rand() * 22));
			}
			ctx.lineTo(x + w + 10, y + h + 10);
			ctx.closePath();
			ctx.fill();
		}
	} else if (variant === 1) {
		// arcane orbits
		ctx.strokeStyle = `hsla(${(hue + 120) % 360}, 75%, 68%, 0.8)`;
		for (let i = 0; i < 4; i++) {
			ctx.lineWidth = 2 + rand() * 4;
			ctx.beginPath();
			ctx.ellipse(x + w / 2, y + h * 0.52, w * (0.12 + i * 0.11), h * (0.07 + i * 0.09),
				rand() * Math.PI, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fillStyle = `hsla(${(hue + 200) % 360}, 85%, 75%, 0.95)`;
			const a = rand() * Math.PI * 2;
			ctx.beginPath();
			ctx.arc(x + w / 2 + Math.cos(a) * w * (0.12 + i * 0.11), y + h * 0.52 + Math.sin(a) * h * (0.07 + i * 0.09),
				4 + rand() * 5, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.9)`;
		ctx.beginPath();
		ctx.arc(x + w / 2, y + h * 0.52, 18 + rand() * 12, 0, Math.PI * 2);
		ctx.fill();
	} else if (variant === 2) {
		// crystal shards
		for (let i = 0; i < 7; i++) {
			const cx = x + rand() * w, cy = y + h * 0.45 + rand() * h * 0.5;
			const sw = 16 + rand() * 34, sh = 50 + rand() * 90;
			ctx.fillStyle = `hsla(${(hue + i * 22) % 360}, 62%, ${45 + rand() * 25}%, 0.9)`;
			ctx.beginPath();
			ctx.moveTo(cx, cy - sh);
			ctx.lineTo(cx + sw / 2, cy);
			ctx.lineTo(cx, cy + sh * 0.25);
			ctx.lineTo(cx - sw / 2, cy);
			ctx.closePath();
			ctx.fill();
		}
	} else {
		// standing stones
		for (let i = 0; i < 5; i++) {
			const bx = x + w * (0.12 + i * 0.19), bw = 26 + rand() * 26, bh = h * (0.3 + rand() * 0.4);
			ctx.fillStyle = `hsla(${hue}, 28%, ${30 + rand() * 16}%, 0.95)`;
			roundRect(ctx, bx - bw / 2, y + h - bh, bw, bh + 10, 10);
			ctx.fill();
		}
		ctx.strokeStyle = `hsla(${(hue + 160) % 360}, 80%, 70%, 0.85)`;
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(x + w / 2, y + h * 0.42, 30 + rand() * 16, 0, Math.PI * 2);
		ctx.stroke();
	}
	// drifting specks
	for (let i = 0; i < 26; i++) {
		ctx.fillStyle = `hsla(${(hue + 180) % 360}, 80%, 82%, ${0.25 + rand() * 0.5})`;
		ctx.beginPath();
		ctx.arc(x + rand() * w, y + rand() * h, 1 + rand() * 2.2, 0, Math.PI * 2);
		ctx.fill();
	}
	// type-family tint so card families read together
	ctx.fillStyle = typeCol + '22';
	ctx.fillRect(x, y, w, h);
}

function statPlate(ctx, cx, cy, r, color, text, textColor = '#fff') {
	const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
	g.addColorStop(0, shade(color, 1.6));
	g.addColorStop(1, shade(color, 0.65));
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.75)';
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.strokeStyle = 'rgba(255,255,255,0.35)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
	ctx.stroke();
	ctx.font = `bold ${Math.round(r * 1.15)}px Georgia`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 6;
	ctx.strokeStyle = '#000';
	ctx.strokeText(text, cx, cy + 2);
	ctx.fillStyle = textColor;
	ctx.fillText(text, cx, cy + 2);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
}

// wrap rules text (keyword runs bold, inline mana/tap pips) as black text inside
// a box, shrinking the font until it fits and centring it vertically
const _meas = document.createElement('canvas').getContext('2d');
function drawPip(ctx, tok, cx, cy, size) {
	const key = tok.key;
	const r = size * 0.58;
	// the coloured cost circle
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = MANA_BG[key === 'N' ? 'N' : key] || MANA_BG.N;
	ctx.fill();
	ctx.lineWidth = Math.max(1, size * 0.06);
	ctx.strokeStyle = 'rgba(0,0,0,0.4)';
	ctx.stroke();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#241f18';
	const cp = key === 'N' ? 0xe605 + Math.min(9, Math.max(0, parseInt(tok.label, 10) || 0)) : MANA_CP[key];
	if (manaReady && cp) {
		// the real MTG symbol glyph from the Mana font
		ctx.font = `${Math.round(size * 0.98)}px "Mana"`;
		ctx.fillText(String.fromCharCode(cp), cx, cy + size * 0.02);
	} else {
		// fallback until the font finishes loading: a letter / number / tap mark
		ctx.font = `bold ${Math.round(size * 0.72)}px 'Segoe UI Symbol', Georgia, sans-serif`;
		ctx.fillText(key === 'tap' ? '⟳' : tok.label, cx, cy + size * 0.03);
	}
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
}
function drawRulesText(ctx, tokens, x, y, w, h) {
	const F = (size, b) => `${b ? 'bold ' : ''}${size}px Georgia`;
	const noSpace = t => /^[,.;:!?)%]/.test(t);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillStyle = '#141018';
	for (let size = 23; size >= 11; size--) {
		const lineH = Math.round(size * 1.22), spaceW = size * 0.3, pipW = size * 1.24;
		const widthOf = tk => { if (tk.kind === 'sym') return pipW; _meas.font = F(size, tk.bold); return _meas.measureText(tk.text).width; };
		const lines = [[]]; let lineW = 0;
		for (const tk of tokens) {
			if (tk.kind === 'br') { lines.push([]); lineW = 0; continue; } // hard line break
			const iw = widthOf(tk);
			const cur = lines[lines.length - 1];
			const punct = tk.kind === 'word' && noSpace(tk.text);
			const need = (cur.length && !punct ? spaceW : 0) + iw;
			if (lineW + need > w && cur.length) { lines.push([tk]); lineW = iw; }
			else { cur.push(tk); lineW += need; }
		}
		if (lines.length * lineH > h) continue;
		let ly = y + Math.max(0, (h - lines.length * lineH) / 2);
		for (const line of lines) {
			let lx = x;
			for (let i = 0; i < line.length; i++) {
				const tk = line[i];
				const punct = tk.kind === 'word' && noSpace(tk.text);
				if (i && !punct) lx += spaceW;
				if (tk.kind === 'sym') { drawPip(ctx, tk, lx + size * 0.56, ly + size * 0.5, size); lx += pipW; }
				else { ctx.font = F(size, tk.bold); ctx.fillStyle = '#141018'; ctx.fillText(tk.text, lx, ly); lx += ctx.measureText(tk.text).width; }
			}
			ly += lineH;
		}
		break;
	}
	ctx.textBaseline = 'alphabetic';
}

// opts: { attack, hp, maxHealth, durability, progress, goal, loyalty, count }
// ---------- dungeon cards: a room flowchart, drawn from engine/dungeons.js ----------
const DUNGEON_THEME = {
	lost_mine: { bg1: '#2a1e12', bg2: '#402c17', node: '#6b4a24', nodeEdge: '#a9793d', edge: '#c99a55', title: '#f0c27a' },
	tomb: { bg1: '#182018', bg2: '#26301f', node: '#3f5136', nodeEdge: '#5f7a4c', edge: '#8fbf6f', title: '#bfe39a' },
	mad_mage: { bg1: '#1c1230', bg2: '#2b1b46', node: '#472d6a', nodeEdge: '#6a49a0', edge: '#b78fe6', title: '#d4b8ff' },
};
function fitText(ctx, s, maxW) {
	s = String(s);
	if (ctx.measureText(s).width <= maxW) return s;
	let t = s;
	while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
	return t + '…';
}
function wrapText(ctx, text, maxW, maxLines) {
	const words = String(text).split(/\s+/), lines = [];
	let line = '';
	for (const w of words) {
		const t = line ? line + ' ' + w : w;
		if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
	}
	if (line) lines.push(line);
	if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1] + '…', maxW); }
	return lines;
}
// current = the room id to highlight (in-game "you are here"); optional.
// dungeonsOverride lets a caller (the wiki) pass freshly-loaded data, bypassing
// this module's cached static import of dungeons.js.
export function drawDungeonFace(ctx, card, W, H, current, dungeonsOverride) {
	const dg = (dungeonsOverride || DUNGEONS)[card.id];
	const th = DUNGEON_THEME[card.id] || DUNGEON_THEME.lost_mine;
	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2);
	ctx.fillStyle = g; roundRect(ctx, 6, 6, W - 12, H - 12, 30); ctx.fill();
	ctx.lineWidth = 6; ctx.strokeStyle = th.edge; roundRect(ctx, 6, 6, W - 12, H - 12, 30); ctx.stroke();
	ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = th.title; ctx.font = 'bold 29px Georgia';
	ctx.fillText(fitText(ctx, (dg && dg.name) || card.name || 'Dungeon', W - 96), W / 2, 46);
	ctx.font = '15px Georgia'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
	ctx.fillText('Dungeon · Advance', W / 2, 70);
	if (!dg) return;

	// longest-path depth from the start = row; columns spread within a row
	const ids = Object.keys(dg.rooms), depth = {};
	for (const id of ids) depth[id] = 0;
	for (let pass = 0, changed = true; changed && pass < ids.length + 1; pass++) {
		changed = false;
		for (const id of ids) for (const nx of (dg.rooms[id].next || [])) if (depth[nx] < depth[id] + 1) { depth[nx] = depth[id] + 1; changed = true; }
	}
	const rows = {}; for (const id of ids) (rows[depth[id]] = rows[depth[id]] || []).push(id);
	const maxRow = Math.max(...Object.keys(rows).map(Number));
	const topY = 92, rowH = (H - 22 - topY) / (maxRow + 1);
	const pos = {};
	for (let d = 0; d <= maxRow; d++) { const row = rows[d] || []; for (let i = 0; i < row.length; i++) pos[row[i]] = { cx: W * (i + 0.5) / row.length, cy: topY + rowH * (d + 0.5) }; }
	const NW = Math.min(196, W / 3 - 12), NH = Math.min(rowH - 16, 96);

	// edges (arrows)
	ctx.lineWidth = 2.5;
	for (const id of ids) { const p = pos[id]; for (const nx of (dg.rooms[id].next || [])) { const q = pos[nx]; if (!q) continue;
		ctx.strokeStyle = th.edge; ctx.fillStyle = th.edge;
		ctx.beginPath(); ctx.moveTo(p.cx, p.cy + NH / 2); ctx.lineTo(q.cx, q.cy - NH / 2); ctx.stroke();
		const ang = Math.atan2((q.cy - NH / 2) - (p.cy + NH / 2), q.cx - p.cx), ax = q.cx, ay = q.cy - NH / 2;
		ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 9 * Math.cos(ang - 0.4), ay - 9 * Math.sin(ang - 0.4)); ctx.lineTo(ax - 9 * Math.cos(ang + 0.4), ay - 9 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
	} }
	// nodes
	for (const id of ids) {
		const p = pos[id], r = dg.rooms[id], x = p.cx - NW / 2, y = p.cy - NH / 2;
		const isStart = id === dg.start, isPayoff = !(r.next || []).length, isHere = id === current;
		ctx.fillStyle = isHere ? shade(th.node, 1.5) : th.node; roundRect(ctx, x, y, NW, NH, 10); ctx.fill();
		ctx.lineWidth = isHere ? 4 : 2; ctx.strokeStyle = isHere ? '#fff' : isStart ? '#7CFC7C' : isPayoff ? '#ffd25f' : th.nodeEdge;
		roundRect(ctx, x, y, NW, NH, 10); ctx.stroke();
		if (isStart) { ctx.textAlign = 'left'; ctx.fillStyle = '#7CFC7C'; ctx.font = 'bold 9px Segoe UI'; ctx.fillText('START', x + 8, y + 13); }
		if (isPayoff) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffd25f'; ctx.font = 'bold 13px Segoe UI'; ctx.fillText('★', x + NW - 7, y + 15); }
		ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Segoe UI';
		ctx.fillText(fitText(ctx, r.name, NW - 14), p.cx, y + 24);
		ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '10px Segoe UI';
		wrapText(ctx, r.text, NW - 14, 3).forEach((ln, i) => ctx.fillText(ln, p.cx, y + 40 + i * 12));
	}
}

export function drawCardFace(card, opts = {}) {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');
	if (card.type === 'dungeon') { drawDungeonFace(ctx, card, W, H, opts.currentRoom, opts.dungeons); return c; }

	const rarity = RARITY_COLORS[card.rarity] || RARITY_COLORS.common;
	const typeCol = TYPE_COLORS[card.type] || '#444';
	const classCol = bodyColorOf(card);

	// frame body carries the CLASS color (or WUBRG colour); banner/border = type
	const body = ctx.createLinearGradient(0, 0, 0, H);
	body.addColorStop(0, shade(classCol, 1.0));
	body.addColorStop(0.5, shade(classCol, 0.55));
	body.addColorStop(1, shade(classCol, 0.78));
	ctx.fillStyle = body;
	roundRect(ctx, 6, 6, W - 12, H - 12, 30);
	ctx.fill();
	// metallic border in the type color, rarity pinline inside it
	const metal = ctx.createLinearGradient(0, 0, W, H);
	metal.addColorStop(0, shade(typeCol, 1.7));
	metal.addColorStop(0.5, shade(typeCol, 0.8));
	metal.addColorStop(1, shade(typeCol, 1.5));
	ctx.strokeStyle = metal;
	ctx.lineWidth = 12;
	roundRect(ctx, 12, 12, W - 24, H - 24, 26);
	ctx.stroke();
	ctx.strokeStyle = rarity;
	ctx.lineWidth = 3;
	roundRect(ctx, 22, 22, W - 44, H - 44, 20);
	ctx.stroke();

	// art window: arched oval
	ctx.save();
	ctx.beginPath();
	ctx.ellipse(W / 2, 236, 204, 168, 0, 0, Math.PI * 2);
	ctx.clip();
	paintArt(ctx, card, W / 2 - 204, 236 - 168, 408, 336);
	ctx.restore();
	ctx.strokeStyle = metal;
	ctx.lineWidth = 8;
	ctx.beginPath();
	ctx.ellipse(W / 2, 236, 204, 168, 0, 0, Math.PI * 2);
	ctx.stroke();

	// name banner: gently curved ribbon
	const bTop = 396, bBot = 462;
	ctx.beginPath();
	ctx.moveTo(30, bTop + 18);
	ctx.quadraticCurveTo(W / 2, bTop - 16, W - 30, bTop + 18);
	ctx.lineTo(W - 30, bBot - 6);
	ctx.quadraticCurveTo(W / 2, bBot + 20, 30, bBot - 6);
	ctx.closePath();
	const banner = ctx.createLinearGradient(0, bTop, 0, bBot);
	banner.addColorStop(0, shade(typeCol, 1.55));
	banner.addColorStop(1, shade(typeCol, 0.7));
	ctx.fillStyle = banner;
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.7)';
	ctx.lineWidth = 4;
	ctx.stroke();

	// name (shrink to fit)
	let size = 38;
	ctx.font = `bold ${size}px Georgia`;
	while (ctx.measureText(card.name).width > W - 120 && size > 19) {
		size -= 2;
		ctx.font = `bold ${size}px Georgia`;
	}
	ctx.textAlign = 'center';
	ctx.lineWidth = 6;
	ctx.strokeStyle = 'rgba(0,0,0,0.85)';
	ctx.strokeText(card.name, W / 2, 440);
	ctx.fillStyle = '#f4eede';
	ctx.fillText(card.name, W / 2, 440);
	ctx.textAlign = 'left';

	// rarity gem under the banner — collectible cards + excavate rewards
	if (showsRarity(card)) {
		const rg = ctx.createRadialGradient(W / 2 - 4, 476, 2, W / 2, 480, 16);
		rg.addColorStop(0, '#fff');
		rg.addColorStop(0.35, rarity);
		rg.addColorStop(1, shade(rarity, 0.4));
		ctx.fillStyle = rg;
		ctx.beginPath();
		ctx.arc(W / 2, 480, 15, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';
		ctx.lineWidth = 3;
		ctx.stroke();
	}

	// rules text box: black text on light tan, keywords bold (no more gem)
	const rbX = 60, rbY = 498, rbW = W - 120, rbH = 132;
	roundRect(ctx, rbX, rbY, rbW, rbH, 16);
	ctx.fillStyle = '#efe6cf';
	ctx.fill();
	ctx.strokeStyle = shade(typeCol, 0.5);
	ctx.lineWidth = 4;
	roundRect(ctx, rbX, rbY, rbW, rbH, 16);
	ctx.stroke();
	if (hasRules(card)) {
		drawRulesText(ctx, richTokens((card.description || '').trim()), rbX + 16, rbY + 12, rbW - 32, rbH - 22);
	}

	if (card.passive) {
		// passive treasures have no mana cost — a gold "PASSIVE" ribbon across
		// the top marks them instead of the blue cost gem
		const rt = 30, rb = 82, label = 'PASSIVE';
		ctx.beginPath();
		ctx.moveTo(96, rt + 14);
		ctx.quadraticCurveTo(W / 2, rt - 12, W - 96, rt + 14);
		ctx.lineTo(W - 96, rb - 6);
		ctx.quadraticCurveTo(W / 2, rb + 16, 96, rb - 6);
		ctx.closePath();
		const rg = ctx.createLinearGradient(0, rt, 0, rb);
		rg.addColorStop(0, '#f0d27a');
		rg.addColorStop(1, '#9a6a1e');
		ctx.fillStyle = rg;
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';
		ctx.lineWidth = 4;
		ctx.stroke();
		ctx.font = 'bold 34px Georgia';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineWidth = 5;
		ctx.strokeStyle = '#3a2a08';
		ctx.strokeText(label, W / 2, rt + 26);
		ctx.fillStyle = '#3a2a08';
		ctx.fillText(label, W / 2, rt + 26);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	} else {
	// mana cost gem — TOP RIGHT now (drawn late so it sits over the frame)
	const mgx = W - 64, mgy = 64;
	const mg = ctx.createRadialGradient(mgx - 12, mgy - 14, 6, mgx, mgy, 54);
	mg.addColorStop(0, '#9db9ff');
	mg.addColorStop(0.5, '#1c4fd6');
	mg.addColorStop(1, '#0d2a78');
	ctx.fillStyle = mg;
	ctx.beginPath();
	ctx.arc(mgx, mgy, 50, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.75)';
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.font = 'bold 58px Georgia';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 7;
	ctx.strokeStyle = '#000';
	ctx.strokeText(String(card.cost ?? ''), mgx, mgy + 4);
	ctx.fillStyle = '#fff';
	ctx.fillText(String(card.cost ?? ''), mgx, mgy + 4);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	}

	// Death Knight runes — HS-style coloured gems down the top-left edge
	if (card.runes && (card.runes.blood || card.runes.frost || card.runes.unholy)) {
		const RUNE = { blood: ['#e04a3a', '#7a1e12'], frost: ['#5cc0ee', '#256f9c'], unholy: ['#6cd86c', '#2f7d2f'] };
		const rx = 58, sz = 30;
		let ry = opts.count != null ? 168 : 118; // sit below the count badge when the gallery shows one
		for (const k of ['blood', 'frost', 'unholy']) {
			for (let i = 0; i < (card.runes[k] || 0); i++) {
				ctx.save();
				ctx.translate(rx, ry);
				ctx.rotate(Math.PI / 4);
				const g = ctx.createLinearGradient(-sz / 2, -sz / 2, sz / 2, sz / 2);
				g.addColorStop(0, RUNE[k][0]); g.addColorStop(1, RUNE[k][1]);
				ctx.fillStyle = g;
				roundRect(ctx, -sz / 2, -sz / 2, sz, sz, 6); ctx.fill();
				ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
				roundRect(ctx, -sz / 2, -sz / 2, sz, sz, 6); ctx.stroke();
				ctx.restore();
				ry += sz + 9;
			}
		}
	}

	// owned-copies badge — TOP LEFT (gallery passes opts.count)
	if (opts.count != null) {
		const bx = 64, by = 64;
		ctx.fillStyle = 'rgba(16,12,26,0.92)';
		roundRect(ctx, bx - 46, by - 28, 92, 56, 14);
		ctx.fill();
		ctx.strokeStyle = opts.count > 0 ? '#ffd25f' : '#5a5470';
		ctx.lineWidth = 4;
		roundRect(ctx, bx - 46, by - 28, 92, 56, 14);
		ctx.stroke();
		ctx.font = 'bold 40px Georgia';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = opts.count > 0 ? '#ffe9a8' : '#8a84a0';
		ctx.fillText('×' + opts.count, bx, by + 3);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	// tribe / quest progress plate at the very bottom center
	if (opts.goal != null) {
		roundRect(ctx, W / 2 - 78, H - 92, 156, 52, 12);
		ctx.fillStyle = shade(TYPE_COLORS.quest, 0.8);
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.font = 'bold 36px Georgia';
		ctx.textAlign = 'center';
		ctx.fillStyle = '#fff';
		ctx.fillText(`${opts.progress ?? 0} / ${opts.goal}`, W / 2, H - 54);
		ctx.textAlign = 'left';
	} else if (card.tribe) {
		roundRect(ctx, W / 2 - 90, H - 78, 180, 40, 18);
		ctx.fillStyle = 'rgba(0,0,0,0.65)';
		ctx.fill();
		ctx.strokeStyle = metal;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.textAlign = 'center';
		ctx.fillStyle = '#d9d2ea';
		// a spell's tribe is its school — label it as such ("Frost Spell")
		const isSpell = card.type === 'sorcery' || card.type === 'instant' || card.type === 'secret' || card.type === 'trap';
		const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
		const plateLabel = isSpell && SCHOOLS.includes(card.tribe) ? `${card.tribe} Spell` : card.tribe;
		// shrink the font so a long tribe (e.g. "Elemental Golem Explorer") stays
		// inside its plate instead of overrunning into the attack/health plates
		let tfs = 25;
		ctx.font = `italic ${tfs}px Georgia`;
		const maxLabelW = 164; // plate is 180 wide; leave a little padding
		const labelW = ctx.measureText(plateLabel).width;
		if (labelW > maxLabelW) ctx.font = `italic ${Math.max(13, tfs * maxLabelW / labelW)}px Georgia`;
		ctx.fillText(plateLabel, W / 2, H - 49);
		ctx.textAlign = 'left';
	}

	// stat plates
	if (card.type === 'creature') {
		const atk = opts.attack ?? card.attack ?? 0;
		const health = opts.hp ?? card.health ?? 0;
		const damaged = opts.maxHealth != null && health < opts.maxHealth;
		statPlate(ctx, 62, H - 62, 50, '#b3902e', String(atk));
		statPlate(ctx, W - 62, H - 62, 50, '#b3402e', String(health), damaged ? '#ffb0a5' : '#fff');
	} else if (card.type === 'weapon') {
		const atk = opts.attack ?? card.attack ?? 0;
		const dur = opts.durability ?? card.durability ?? 0;
		statPlate(ctx, 62, H - 62, 50, '#b3902e', String(atk));
		statPlate(ctx, W - 62, H - 62, 50, '#5e6a72', String(dur));
	} else if (card.type === 'location') {
		// remaining taps, weapon-style but in the location green
		const dur = opts.durability ?? card.durability ?? 0;
		statPlate(ctx, W - 62, H - 62, 50, '#2e7a5e', String(dur));
	} else if (card.type === 'planeswalker') {
		statPlate(ctx, W - 62, H - 62, 50, '#5a2e7a', String(opts.loyalty ?? card.loyalty ?? 0));
	}

	return c;
}

export function makeFaceTexture(card, opts = {}) {
	const tex = new THREE.CanvasTexture(drawCardFace(card, opts));
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// just the card's illustration — no frame, banner, or oval clip. Real art if
// it's loaded (call preloadArt first), otherwise the procedural scene.
export function drawArt(card, w = 448, h = 448) {
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	paintArt(c.getContext('2d'), card, 0, 0, w, h);
	return c;
}

// ---------- board tokens: HS-style minion ovals ----------
// once a creature is in play it stops looking like a card: oval art,
// heavy rim, and BIG stat gems that read from across the table
export const TOKEN_W = 512, TOKEN_H = 640;
export const TOKEN_GEM = { x: 0.5, y: 560 / TOKEN_H, r: 42 / TOKEN_W };

// opts: { attack, hp, maxHealth, baseAttack, baseHealth, taunt, shield, stealthed }
// scale renders the same 512x640 layout onto a smaller canvas — board tokens
// are never shown large (card text lives on the hand/inspect faces), so the
// GPU texture doesn't need full card resolution
export function drawBoardToken(card, opts = {}, scale = 1) {
	const c = document.createElement('canvas');
	c.width = Math.round(TOKEN_W * scale); c.height = Math.round(TOKEN_H * scale);
	const ctx = c.getContext('2d');
	ctx.scale(scale, scale);
	const cx = TOKEN_W / 2, cy = 288, rx = 200, ry = 258;

	// taunt: a heavy stone shield ring around the whole token
	if (opts.taunt) {
		ctx.strokeStyle = '#565d68';
		ctx.lineWidth = 34;
		ctx.beginPath(); ctx.ellipse(cx, cy, rx + 24, ry + 24, 0, 0, Math.PI * 2); ctx.stroke();
		ctx.strokeStyle = '#8b93a1';
		ctx.lineWidth = 12;
		ctx.beginPath(); ctx.ellipse(cx, cy, rx + 36, ry + 36, 0, 0, Math.PI * 2); ctx.stroke();
	}
	// divine shield: golden halo
	if (opts.shield) {
		ctx.strokeStyle = 'rgba(255,214,90,0.85)';
		ctx.lineWidth = 22;
		ctx.beginPath(); ctx.ellipse(cx, cy, rx + 18, ry + 18, 0, 0, Math.PI * 2); ctx.stroke();
	}

	// oval art window
	ctx.save();
	ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
	paintArt(ctx, card, cx - rx, cy - ry, rx * 2, ry * 2);
	if (opts.stealthed) {
		ctx.fillStyle = 'rgba(16,16,30,0.55)';
		ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
	}
	ctx.restore();

	// metallic rim (class-tinted)
	ctx.strokeStyle = shade(classColorOf(card.cardClass), 0.5);
	ctx.lineWidth = 16;
	ctx.beginPath(); ctx.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2); ctx.stroke();
	ctx.strokeStyle = 'rgba(255,255,255,0.28)';
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.ellipse(cx, cy, rx - 7, ry - 7, 0, 0, Math.PI * 2); ctx.stroke();

	// BIG stat gems: white normal, green when buffed, red health when hurt
	const baseA = opts.baseAttack ?? opts.attack;
	const baseH = opts.baseHealth ?? opts.maxHealth;
	const atkColor = opts.attack > baseA ? '#7cfc7c' : '#fff';
	const hpColor = opts.hp < opts.maxHealth ? '#ff6257' : (opts.maxHealth > baseH ? '#7cfc7c' : '#fff');
	statPlate(ctx, 88, 538, 84, '#e2a52e', String(opts.attack ?? 0), atkColor);
	statPlate(ctx, TOKEN_W - 88, 538, 84, '#c23b2e', String(opts.hp ?? 0), hpColor);
	return c;
}

export function makeTokenTexture(card, opts) {
	// 320x400 (0.625x): a board token displays at well under 300 device px even
	// on a zoomed phone — full 512x640 was pure VRAM waste (1.3MB -> 0.5MB each)
	const tex = new THREE.CanvasTexture(drawBoardToken(card, opts, 0.625));
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

// ---------- hero portraits + power orbs (DOM panels) ----------
export function drawHeroPortrait(classId, size = 128) {
	const c = document.createElement('canvas');
	c.width = size; c.height = size;
	const ctx = c.getContext('2d');
	const r = size / 2 - 5;
	ctx.save();
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.clip();
	paintArt(ctx, { id: 'hero_' + (classId || 'neutral'), type: 'creature' }, 0, 0, size, size);
	// grounding vignette
	const v = ctx.createRadialGradient(size / 2, size / 2, r * 0.55, size / 2, size / 2, r);
	v.addColorStop(0, 'rgba(0,0,0,0)');
	v.addColorStop(1, 'rgba(0,0,0,0.45)');
	ctx.fillStyle = v;
	ctx.fillRect(0, 0, size, size);
	ctx.restore();
	ctx.strokeStyle = 'rgba(0,0,0,0.8)';
	ctx.lineWidth = 7;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
	ctx.strokeStyle = classColorOf(classId);
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
	return c;
}

export function drawPowerOrb(cost, size = 96) {
	const c = document.createElement('canvas');
	c.width = size; c.height = size;
	const ctx = c.getContext('2d');
	const r = size / 2 - 5;
	const g = ctx.createRadialGradient(size * 0.38, size * 0.34, r * 0.15, size / 2, size / 2, r);
	g.addColorStop(0, '#8fd0ff');
	g.addColorStop(0.55, '#2c6fd4');
	g.addColorStop(1, '#123058');
	ctx.fillStyle = g;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.fill();
	ctx.strokeStyle = '#b8952e';
	ctx.lineWidth = 5;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
	ctx.strokeStyle = 'rgba(255,255,255,0.35)';
	ctx.lineWidth = 2;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, r - 4, 0, Math.PI * 2); ctx.stroke();
	ctx.font = `bold ${Math.round(size * 0.42)}px Georgia`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 5;
	ctx.strokeStyle = '#000';
	ctx.strokeText(String(cost), size / 2, size / 2 + 1);
	ctx.fillStyle = '#fff';
	ctx.fillText(String(cost), size / 2, size / 2 + 1);
	return c;
}

export function makeBackTexture() {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');
	const bg = ctx.createLinearGradient(0, 0, W, H);
	bg.addColorStop(0, '#241a3e');
	bg.addColorStop(1, '#120c22');
	ctx.fillStyle = bg;
	roundRect(ctx, 4, 4, W - 8, H - 8, 30);
	ctx.fill();
	ctx.strokeStyle = '#5a4a8a';
	ctx.lineWidth = 12;
	roundRect(ctx, 14, 14, W - 28, H - 28, 26);
	ctx.stroke();
	ctx.strokeStyle = '#8f6fff';
	ctx.lineWidth = 8;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(W / 2 + Math.cos(a) * 120, H / 2 + Math.sin(a) * 120);
		ctx.lineTo(W / 2 + Math.cos(a) * 150, H / 2 + Math.sin(a) * 150);
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = '#c9b8ff';
	ctx.font = 'bold 28px Georgia'; // small enough to sit comfortably inside the circle
	ctx.textAlign = 'center';
	ctx.fillText('MAGEPUNK', W / 2, H / 2 + 10);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}
