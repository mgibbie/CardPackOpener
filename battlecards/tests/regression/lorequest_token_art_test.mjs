// Lorequest-generated cards and tokens resolve to REAL art (bug:1794267812239,
// bug:1794272972983, bug:1794273394890 — instinctgauntlet, Middle-earth, ME revision 82).
//
// DIAGNOSIS: Lorequest cards and hero powers summon inline tokens
// ({type:'summon', name:'Goblin of Moria', ...}); the engine names each token_<slug of name>.
// No art existed under any of those 113 ids (Goblin of Moria, Gundabad Goblin, Dol Guldur
// Wraith, ... across Middle-earth, Sword Coast, Final Fantasy, Multiverse and Lorequest),
// so cardart.js drew the procedural fallback — forever: nothing was loading, so nothing
// ever arrived to replace it. It read as a placeholder stuck mid-load.
// (Evidence A, me_cotw_attercop, HAS art on the CDN and renders on the spoils screen; its
// stuck face matches the failed-request-stays-cached bug fixed in #1023, deployed ~2h
// before that report. A give-up now also forgets the failure so a later paint retries.)
// FIX: 104 tokens got their own composed crop (tools/lorequest_token_art.py, spec
// tools/data/lorequest_token_art.json); 9 whose creature an existing card already pictures
// wear that card's art via cardart.js ART_ALIASES — and every art listener in game.js now
// matches the ART id a face painted (artIdOf), so an aliased token repaints when that art lands.
//
// Needs the art index: battlecards/art/index.json locally, else the CDN's copy.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };
const here = p => new URL(p, import.meta.url);
const read = p => fs.readFileSync(here(p), 'utf8');

const cards = JSON.parse(read('../../cards.json')).cards;
const byId = Object.fromEntries(cards.map(c => [c.id, c]));

// the art index (what cardart.js fetches)
let index;
const localIdx = here('../../art/index.json');
if (fs.existsSync(localIdx)) index = JSON.parse(fs.readFileSync(localIdx, 'utf8'));
else index = await (await fetch('https://magepunk-cardart.pages.dev/index.json')).json();
const has = new Set(index);

// cardart.js's own resolution (it imports three + the DOM, so evaluate just these lines)
const art = read('../../cardart.js');
const aliasSrc = art.match(/export const ART_ALIASES = (\{[\s\S]*?\n\});/);
const ART_ALIASES = aliasSrc ? new Function('return ' + aliasSrc[1])() : {};
const artIdOf = card => (card && card.artFrom) || (card && ART_ALIASES[card.id]) || (card && card.id) || '';
const resolves = card => has.has(artIdOf(card));

// ---- 1) the four reported cards / tokens ----
{
	ok('Chief of the Wilds\' Attercop (me_cotw_attercop) resolves to art', resolves(byId.me_cotw_attercop));
	// the tokens exactly as the engine makes them: play the real cards
	const tokenIdsFrom = (cardId, pi = 0) => {
		const r = new Scenario(byId).players(2).mana(pi, 10).hand(pi, [cardId]).play(pi, cardId).run();
		return r.state.players[pi].board.filter(c => c.id !== cardId).map(c => c);
	};
	const goblins = tokenIdsFrom('me_gimli_swarm');
	ok('Gimli\'s Swarming of Moria makes 3 Goblin of Moria tokens', goblins.length === 3 && goblins.every(c => c.id === 'token_goblin_of_moria'), goblins.map(c => c.id).join());
	ok('...and they resolve to art', goblins.length && goblins.every(resolves));
	const gundabad = tokenIdsFrom('me_bo_sig');
	ok('Bolg of the North makes Gundabad Goblins that resolve to art', gundabad.length === 2 && gundabad.every(c => c.id === 'token_gundabad_goblin' && resolves(c)), gundabad.map(c => c.id).join());
	const wraiths = tokenIdsFrom('me_sn_sig');
	ok('Sauron, the Necromancer makes Dol Guldur Wraiths that resolve to art', wraiths.length === 2 && wraiths.every(c => c.id === 'token_dol_guldur_wraith' && resolves(c)), wraiths.map(c => c.id).join());
	// the Relic of Sauron (me_sn_art) taps for the same token
	const relic = JSON.stringify(byId.me_sn_art.tapAbility);
	ok('Relic of Sauron taps for a Dol Guldur Wraith (the same token id)', relic.includes('"Dol Guldur Wraith"'));
}

// ---- 2) sweep: EVERY Lorequest card, and every token a Lorequest card or hero power makes ----
{
	const TAGS = ['meDeck', 'scDeck', 'ffDeck', 'mvDeck', 'loreDeck', 'meTreasure', 'scTreasure', 'ffTreasure', 'mvTreasure'];
	const lq = cards.filter(c => TAGS.some(t => c[t]));
	ok(`found the Lorequest cards (${lq.length})`, lq.length > 2000);
	const noArt = lq.filter(c => !resolves(c)).map(c => c.id);
	ok('every Lorequest card resolves to art', noArt.length === 0, noArt.slice(0, 20).join(' '));

	// inline tokens: {name, attack/health} with no id of its own -> token_<slug>, as the engine names them
	const slug = n => 'token_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '_');
	const tokens = new Map();
	const walk = (v, from) => {
		if (Array.isArray(v)) { for (const x of v) walk(x, from); return; }
		if (!v || typeof v !== 'object') return;
		if (typeof v.name === 'string' && (typeof v.attack === 'number' || typeof v.health === 'number') && !v.id && !v.summonId) {
			const id = slug(v.name); if (!tokens.has(id)) tokens.set(id, from);
		}
		for (const x of Object.values(v)) walk(x, from);
	};
	for (const c of lq) for (const [k, v] of Object.entries(c)) if (k !== 'id') walk(v, c.id);
	for (const m of ['middleearth', 'swordcoast', 'finalfantasy', 'multiverse', 'lorequest']) {
		const mod = await import(new URL('../../' + m + '.js', import.meta.url).href);
		for (const [ch, p] of Object.entries(mod.HERO_POWERS || {})) if (p) walk(p, `${m} hero power (${ch})`);
	}
	ok(`found the Lorequest-generated tokens (${tokens.size})`, tokens.size >= 120);
	const missing = [...tokens].filter(([id]) => !resolves({ id })).map(([id, from]) => `${id} <- ${from}`);
	ok('every Lorequest-generated token resolves to art', missing.length === 0, `${missing.length}: ` + missing.slice(0, 12).join(', '));
	// ids a Lorequest card names directly (summonId etc.) too
	const refs = [];
	const walkIds = (v, key) => {
		if (Array.isArray(v)) { for (const x of v) walkIds(x, key); return; }
		if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) walkIds(x, k); return; }
		if (typeof v === 'string' && ['summonId', 'cardId', 'tokenId', 'intoId', 'ids', 'id'].includes(key) && byId[v]) refs.push(v);
	};
	for (const c of lq) for (const [k, v] of Object.entries(c)) if (k !== 'id') walkIds(v, k);
	const badRefs = [...new Set(refs)].filter(id => !resolves(byId[id]));
	ok('every card a Lorequest card creates by id resolves to art', badRefs.length === 0, badRefs.join(' '));
}

// ---- 3) the spec and the aliases agree ----
{
	const spec = JSON.parse(read('../../../tools/data/lorequest_token_art.json')).tokens;
	const aliasIds = Object.entries(spec).filter(([, t]) => t.alias);
	ok('every alias in the spec is in ART_ALIASES', aliasIds.every(([id, t]) => ART_ALIASES[id] === t.alias), aliasIds.filter(([id, t]) => ART_ALIASES[id] !== t.alias).map(([id]) => id).join());
	const srcMissing = Object.entries(spec).filter(([id, t]) => t.src && !has.has(id)).map(([id]) => id);
	ok('every composed token is in the art index (deployed)', srcMissing.length === 0, srcMissing.join(' '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
