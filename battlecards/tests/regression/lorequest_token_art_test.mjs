// Generated cards and tokens resolve to REAL art: Lorequest (bug:1794267812239,
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
// Sections 4-6 extend the sweep to the WHOLE card pool (bug:1794331480267).
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

// ==== bug:1794331480267 (instinctgauntlet, Final Fantasy): the SAME class outside Lorequest ====
// Bubba's Bloodhounds (token_bloodhound, an engine-made Duels token) and Rattlegore's -1/-1
// resummon (token_rattlegore, a stat-changed copy under a new id) kept the spiral placeholder.
// Root causes: (a) ~200 token ids the engine and the cards make had no art at all; (b) every
// path that copies a real card under a token_ id (Rattlegore, random transforms, random
// weapons, Lukka, ...) dropped the link to the card's art. Fixed: those tokens got composed
// art (tools/data/token_art.json) or an ART_ALIASES entry; copies carry `artFrom`
// (instantiate keeps it; core.js tokenArtFrom stamps it on any token_<real card id>);
// emblems, Shadows, Slimed and timed enchantments wear the card that made them.
const resolvesInst = c => has.has(artIdOf(c));
const quiet = fn => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

// ---- 4) the two reported cases, as the engine really makes them ----
{
	const r = quiet(() => new Scenario(byId).players(2).mana(0, 10).hand(0, ['duels_bubba'])
		.board(1, [{ id: 'rattlegore', attack: 0, health: 99 }]).play(0, 'duels_bubba', { targetBoard: [1, 0] }).run());
	const hounds = r.state.players[0].board.filter(c => c.id === 'token_bloodhound');
	ok('Bubba summons Bloodhounds (token_bloodhound)', hounds.length === 6, r.state.players[0].board.map(c => c.id).join());
	ok('...and they resolve to art', hounds.length > 0 && hounds.every(resolvesInst), hounds.map(artIdOf).join());

	// Rattlegore dies again and again: each resummon is a fresh token_rattlegore copy, -1/-1 each time
	const s = quiet(() => E.createGame(byId, () => 0.4, null, 2));
	for (const p of s.players) { p.hand = []; p.deck = []; p.board = []; }
	const rg = E.instantiate(byId.rattlegore, 0); rg.zone = 'board'; s.players[0].board.push(rg);
	const seen = [];
	for (let i = 0; i < 10; i++) {
		const cur = s.players[0].board.find(c => c.name === 'Rattlegore' && !E.isDead(c));
		if (!cur) break;
		seen.push({ id: cur.id, at: cur.attack, art: artIdOf(cur) });
		cur.damage = 999; quiet(() => E.sweepDeaths(s));
	}
	ok('Rattlegore resummons itself down to 1/1 (9 bodies)', seen.length === 9 && seen[8].at === 1, seen.map(x => x.at).join());
	ok('every resummoned Rattlegore wears Rattlegore\'s art', seen.length > 1 && seen.every(x => x.art === 'rattlegore'), seen.map(x => x.id + '>' + x.art).join(' '));
	// a resumed game: the copy's link to its art survives a snapshot round trip
	const s2 = quiet(() => E.createGame(byId, () => 0.4, null, 2));
	for (const p of s2.players) { p.hand = []; p.deck = []; p.board = []; }
	const r2 = E.instantiate(byId.rattlegore, 0); r2.zone = 'board'; s2.players[0].board.push(r2);
	r2.damage = 999; quiet(() => E.sweepDeaths(s2));
	const back = quiet(() => E.fromSnapshot(JSON.parse(JSON.stringify(E.toSnapshot(s2))), byId));
	const copy = back.players[0].board.find(c => c.id === 'token_rattlegore');
	ok('...and after a save/resume the resummoned copy still wears it', !!copy && artIdOf(copy) === 'rattlegore', copy && artIdOf(copy));
}

// ---- 5) whole pool: every token / id ANY card, run-mode module or engine path creates ----
{
	const slug = n => 'token_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '_');
	quiet(() => E.createGame(byId, () => 0.4, null, 2)); // the engine's card DB (tokenArtFrom reads it)
	// what the engine wears for an id it makes (artFrom stamped when the id names a real card)
	const resolveId = id => has.has(artIdOf(E.instantiate({ id, name: id, type: 'creature' }, 0)));
	const tokens = new Map();
	const walkTok = (v, from) => {
		if (Array.isArray(v)) { for (const x of v) walkTok(x, from); return; }
		if (!v || typeof v !== 'object') return;
		// a run mode's boss / hero / explorer is a hero, not a token (it has a power, hsId or level)
		const heroLike = v.hsId || v.power || v.heroPower || v.theme || v.level != null || v.type === 'buff'; // (a buff's name is a label)
		if (typeof v.name === 'string' && (typeof v.attack === 'number' || typeof v.health === 'number') && !v.id && !v.summonId && !heroLike) {
			const id = slug(v.name); if (!tokens.has(id)) tokens.set(id, from);
		}
		for (const x of Object.values(v)) walkTok(x, from);
	};
	for (const c of cards) for (const [k, v] of Object.entries(c)) if (k !== 'id') walkTok(v, c.id);
	for (const m of ['heist', 'tombs', 'duels', 'dungeon', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse']) {
		const mod = await import(new URL('../../' + m + '.js', import.meta.url).href);
		for (const [k, v] of Object.entries(mod)) if (/^[A-Z_]+$/.test(k) && v && typeof v === 'object') walkTok(v, m + '.' + k);
	}
	ok(`found the inline tokens of the whole pool (${tokens.size})`, tokens.size >= 480);
	const missing = [...tokens].filter(([id]) => !resolveId(id)).map(([id, from]) => `${id} <- ${from}`);
	ok('every inline token in the whole pool resolves to art', missing.length === 0, `${missing.length}: ` + missing.slice(0, 15).join(', '));

	// ids the ENGINE names itself: id: 'token_x' literals in engine/ (Bloodhound, Risen Ghoul, ...)
	const engineDir = here('../../engine/');
	const files = [...fs.readdirSync(engineDir).filter(f => f.endsWith('.js')).map(f => new URL(f, engineDir)),
		...fs.readdirSync(new URL('effects/', engineDir)).filter(f => f.endsWith('.js')).map(f => new URL('effects/' + f, engineDir))];
	const lits = new Map();
	for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/id: '(token_[a-z0-9_]+)'/g)) lits.set(m[1], f.pathname.split('/').pop());
	ok(`found the engine's own token ids (${lits.size})`, lits.size >= 25);
	ok('Bubba\'s token_bloodhound is among them', lits.has('token_bloodhound'));
	const badLits = [...lits].filter(([id]) => !resolveId(id)).map(([id, f]) => `${id} <- ${f}`);
	ok('every token id the engine names resolves to art', badLits.length === 0, badLits.join(', '));

	// ids any card creates by reference (summonId, cardId, ...)
	const refs = new Set();
	const walkIds = (v, key) => {
		if (Array.isArray(v)) { for (const x of v) walkIds(x, key); return; }
		if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) walkIds(x, k); return; }
		if (typeof v === 'string' && ['summonId', 'cardId', 'tokenId', 'intoId', 'ids'].includes(key)) refs.add(v);
	};
	for (const c of cards) for (const [k, v] of Object.entries(c)) if (k !== 'id') walkIds(v, k);
	const badRefs = [...refs].filter(id => byId[id] && !resolves(byId[id]));
	ok(`every card a card creates by id resolves to art (${refs.size} ids)`, badRefs.length === 0, badRefs.slice(0, 20).join(' '));

	// a copy of ANY real card made under a token_ id wears that card's art
	const sample = cards.filter(c => c.type === 'creature' && has.has(c.id));
	const badCopies = sample.filter(c => !resolveId('token_' + c.id)).map(c => c.id);
	ok(`a token_<card id> copy of a real card wears that card's art (${sample.length})`, badCopies.length === 0, badCopies.slice(0, 10).join(' '));
	// emblems wear the card that granted them
	const st = quiet(() => E.createGame(byId, () => 0.4, null, 2));
	const src = E.instantiate(byId.chandra_sig, 0);
	quiet(() => E.execEffects(st, 0, [{ type: 'emblem', name: 'Pyromaster', description: 'x' }], null, src));
	const em = st.players[0].emblems.at(-1);
	ok('an emblem wears the card that granted it', !!em && resolvesInst(em) && artIdOf(em) === 'chandra_sig', em && artIdOf(em));
}

// ---- 6) the whole-pool spec and ART_ALIASES agree; every composed token is deployed ----
{
	const spec = JSON.parse(read('../../../tools/data/token_art.json')).tokens;
	const bad = Object.entries(spec).filter(([id, t]) => t.alias ? ART_ALIASES[id] !== t.alias || !has.has(t.alias) : !has.has(id)).map(([id]) => id);
	ok(`every token in tools/data/token_art.json resolves (${Object.keys(spec).length})`, bad.length === 0, bad.join(' '));
	ok('the spec has the Bloodhound', !!(spec.token_bloodhound && spec.token_bloodhound.hs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
