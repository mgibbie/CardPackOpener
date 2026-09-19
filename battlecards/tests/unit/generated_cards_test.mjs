// generated_cards_test.mjs — "what does this card create?" is the relation the
// wiki card pages (and the in-game inspect) list under Generates / Created by.
//
// Reported: Zixor, Apex Predator's page should show Zixor Prime, and more broadly
// EVERY card that makes a specific other card should list it. Several real
// relations were being missed because their field wasn't in GENERATES_KEYS:
// alternate `forms`, Duels `improves` tiers, a hero power's `tacticFamily`,
// `transformWhenDrawn` weapons and the `to` transform chain (~86 links).
//
// The opposite failure matters just as much: several KEYWORDS are also card ids
// ('charge', 'windfury', 'silence'), so walking keyword/type fields would invent
// relationships that don't exist.
//
// cardart.js imports three, so (like server_replay_test) the functions are
// extracted from source and run against the real card data.
//   node battlecards/tests/unit/generated_cards_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../../cardart.js', import.meta.url), 'utf8');
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

function extractFn(name) {
	const i = src.indexOf('export function ' + name);
	if (i < 0) throw new Error('not found: ' + name);
	let depth = 0, started = false, k = i;
	for (; k < src.length; k++) {
		if (src[k] === '{') { depth++; started = true; }
		else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } }
	}
	return src.slice(i, k).replace('export function', 'function');
}
const keysSrc = /const GENERATES_KEYS = new Set\(\[[\s\S]*?\]\);/.exec(src);
ok('GENERATES_KEYS is declared in cardart.js', !!keysSrc);
const { generatedCardIds, createdByIds } = new Function(
	keysSrc[0] + '\nlet _createdBy = null;\n' + extractFn('generatedCardIds') + '\n' + extractFn('createdByIds')
	+ '\nreturn { generatedCardIds, createdByIds };')();

const gen = id => generatedCardIds(byId[id], byId);

// ── the reported card ──
ok('Zixor, Apex Predator generates Zixor Prime', gen('zixor_apex_predator').includes('zixor_prime'), gen('zixor_apex_predator').join(','));
ok('...and Zixor Prime lists Zixor as its creator', createdByIds('zixor_prime', byId).includes('zixor_apex_predator'), createdByIds('zixor_prime', byId).join(','));

// ── the relation kinds that were being missed ──
ok('alternate forms count (Lady Naz\'jar -> her 3 forms)', gen('lady_nazjar').filter(x => x.startsWith('lady_nazjar_form')).length === 3, gen('lady_nazjar').join(','));
ok('transformWhenDrawn weapons (Unidentified Maul -> 4 mauls)', gen('unidentified_maul').length === 4, gen('unidentified_maul').join(','));
ok('Duels upgrade tiers (Scourge Strike -> s1..s3)', gen('duels_scourge_strike').filter(x => /_s\d$/.test(x)).length === 3, gen('duels_scourge_strike').join(','));
ok('hero-power tactic families', gen('duelshp_battle_tactics').length >= 3, gen('duelshp_battle_tactics').join(','));
ok('transform chains (Past -> Present Silvermoon)', gen('past_silvermoon').includes('present_silvermoon'), gen('past_silvermoon').join(','));
// ...and the kinds that already worked must keep working
ok('Corrupt forms still listed', gen('strongman').includes('strongman_corrupted'), gen('strongman').join(','));

// ── false positives: a keyword that shares a card id must NOT become a relation ──
{
	const boar = gen('stonetusk_boar');
	ok('a Charge creature does not "generate" the card named Charge', !boar.includes('charge'), boar.join(','));
	const owl = gen('ironbeak_owl');
	ok('a Silence effect does not "generate" the card named Silence', !owl.includes('silence'), owl.join(','));
	ok('a granted keyword is not a generated card', !gen('hazorets_favor').includes('charge'), gen('hazorets_favor').join(','));
}

// ── "cares about" is not "creates" ──
ok('Feugen does not generate Stalagg (a pair-up condition)', !gen('feugen').includes('stalagg'), gen('feugen').join(','));
ok('a cost condition naming a card is not generation', !gen('karazhan_the_sanctum').includes('atiesh_the_greatstaff'), gen('karazhan_the_sanctum').join(','));

// ── whole-set sanity ──
{
	let cards = 0, links = 0, selfRef = 0, dangling = 0;
	for (const c of raw.cards) {
		const g = generatedCardIds(c, byId);
		if (!g.length) continue;
		cards++; links += g.length;
		if (g.includes(c.id)) selfRef++;
		for (const x of g) if (!byId[x]) dangling++;
	}
	ok('a large share of the set declares generated cards (>=500)', cards >= 500, cards);
	ok('every generated id resolves to a real card', dangling === 0, dangling);
	ok('no card lists itself as its own creation', selfRef === 0, selfRef);
	ok('the relation is not runaway (links stay proportional)', links >= cards && links < cards * 4, `${links} links / ${cards} cards`);
}

// ── the reverse index agrees with the forward one ──
{
	let mismatches = 0;
	for (const c of raw.cards.slice(0, 400)) {
		for (const g of generatedCardIds(c, byId)) if (!createdByIds(g, byId).includes(c.id)) mismatches++;
	}
	ok('createdByIds is the exact inverse of generatedCardIds', mismatches === 0, mismatches);
}

// ── a generated copy should LOOK like the card that made it ──
// A Twinspell's second cast has no art of its own, so it fell back to the
// procedural illustration next to its fully-illustrated parent; `artFrom` points
// it at the parent's art. Colour comes from bodyColorOf, which colours lore-deck
// cards by CLASS (so a hero's pool reads as one colour) and everything else by
// its WUBRG colors[] — a copy missing its parent's lore tags rendered red beside
// a gold parent.
{
	// brace-match a multi-line `const NAME = {...};`
	const block = name => {
		const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(src);
		if (!m) throw new Error('const not found: ' + name);
		let depth = 0, started = false, k = m.index;
		for (; k < src.length; k++) {
			if (src[k] === '{') { depth++; started = true; }
			else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } }
		}
		return src.slice(m.index, k) + ';';
	};
	const line = name => new RegExp('const ' + name + '\\s*=[^\\n]+').exec(src)[0];
	const bodyColorOf = new Function([
		block('CLASS_COLORS').replace('export const', 'const'), block('CLASS_ALIASES'),
		extractFn('canonClass'), extractFn('classColorOf'),
		line('COLOR_BODY'), line('LORE_VARIANT_TAGS'), extractFn('bodyColorOf'),
		'return bodyColorOf;',
	].join('\n'))();

	const pairs = raw.cards.filter(c => c.artFrom).map(c => [c, byId[c.artFrom]]);
	ok('some cards declare an inherited illustration (artFrom)', pairs.length >= 5, pairs.length);
	ok('every artFrom points at a real card', pairs.every(([, p]) => !!p), raw.cards.filter(c => c.artFrom && !byId[c.artFrom]).map(c => c.id).join(','));
	ok('no card inherits art from itself', raw.cards.every(c => c.artFrom !== c.id));
	// integrity: you may only borrow the art of a card that actually creates you
	{
		const bad = pairs.filter(([c, p]) => p && !generatedCardIds(p, byId).includes(c.id)).map(([c]) => c.id);
		ok('a card only inherits art from a card that GENERATES it', bad.length === 0, bad.join(','));
	}
	// the reported card, and its four siblings
	ok('Rally at the Hornburg II inherits its creator\'s art', byId.me_aragorn_rally_ii.artFrom === 'me_aragorn_rally', byId.me_aragorn_rally_ii.artFrom);
	for (const id of ['conjurers_calling_ii', 'air_raid_ii', 'desperate_measures_ii', 'rising_winds_ii']) {
		ok(`${id} inherits its creator's art`, byId[id].artFrom === id.replace(/_ii$/, ''), byId[id].artFrom);
	}
	// and the colour actually matches, computed through the shipped bodyColorOf
	{
		const mismatched = pairs.filter(([c, p]) => p && bodyColorOf(c) !== bodyColorOf(p)).map(([c, p]) => `${c.id}:${bodyColorOf(c)} vs ${p.id}:${bodyColorOf(p)}`);
		ok('every inheriting copy renders the SAME frame colour as its creator', mismatched.length === 0, mismatched.join(' | '));
	}
	ok('the reported pair specifically matches', bodyColorOf(byId.me_aragorn_rally_ii) === bodyColorOf(byId.me_aragorn_rally),
		bodyColorOf(byId.me_aragorn_rally_ii) + ' vs ' + bodyColorOf(byId.me_aragorn_rally));
	// artIdOf is what the renderer actually calls
	const artIdOf = new Function(line('artIdOf').replace('export const', 'const') + '; return artIdOf;')();
	ok('artIdOf resolves a copy to its creator\'s art id', artIdOf(byId.me_aragorn_rally_ii) === 'me_aragorn_rally');
	ok('artIdOf leaves an ordinary card on its own id', artIdOf(byId.me_aragorn_rally) === 'me_aragorn_rally');
	ok('artIdOf is safe on junk', artIdOf(null) === '' && artIdOf({}) === '');
}

// ── every generated card must end up with the RIGHT art ──
// Inheritance is only ever legitimate between the same card: a Twinspell's second
// cast, a tier, a form. A summoned Soldier token must NOT wear its summoner's
// portrait, so artFrom additionally requires a shared name.
{
	const inheriting = raw.cards.filter(c => c.artFrom);
	const wrongIdentity = inheriting.filter(c => {
		const p = byId[c.artFrom];
		const a = String(c.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
		const b = String((p && p.name) || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
		return !p || !(a === b || a.startsWith(b) || b.startsWith(a));
	}).map(c => c.id);
	ok('art is only inherited between the SAME card (a token never wears its summoner\'s art)', wrongIdentity.length === 0, wrongIdentity.join(','));

	// the stand-in registry must stay honest
	let placeholders = [];
	try { placeholders = JSON.parse(fs.readFileSync(new URL('../../art-placeholders.json', import.meta.url))).cards || []; } catch (e) { /* optional */ }
	ok('every flagged stand-in still names a real card', placeholders.every(p => !!byId[p.id]), placeholders.filter(p => !byId[p.id]).map(p => p.id).join(','));
	ok('every flagged stand-in still records what it reuses and why', placeholders.every(p => p.source && p.reason));

	// art/index.json is gitignored (built + deployed separately), so the coverage
	// half only runs where it exists — a dev box — and is skipped loudly in CI.
	let artIds = null;
	try { artIds = new Set(JSON.parse(fs.readFileSync(new URL('../../art/index.json', import.meta.url)))); } catch (e) { /* not present */ }
	if (!artIds) {
		console.log('note: battlecards/art/index.json absent (gitignored) — art COVERAGE checks skipped, inheritance rules still enforced');
	} else {
		const generated = new Set();
		for (const c of raw.cards) for (const g of generatedCardIds(c, byId)) generated.add(g);
		const artIdOf = c => (c && c.artFrom) || (c && c.id) || '';
		const missing = [...generated].filter(id => !artIds.has(artIdOf(byId[id])));
		ok('EVERY generated card resolves to a real art file', missing.length === 0, missing.slice(0, 12).join(','));
		ok('the generated set is substantial (the check is not vacuous)', generated.size >= 500, generated.size);
		// a generated card that borrows art must borrow art that actually exists
		ok('every inherited art id exists in the index', inheriting.every(c => artIds.has(c.artFrom)),
			inheriting.filter(c => !artIds.has(c.artFrom)).map(c => c.id).join(','));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
