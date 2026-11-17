// Pocket Enhanced: builds, from what the fetch tools kept,
//   pocketenhanced/js/data/theme_decks.js   the decks Pokémon TCG Pocket itself hands out
//                                           (data/source/theme_decks.json, tools/pocket_fetch_theme_decks.mjs)
//   pocketenhanced/js/data/solo_battles.js  its solo battles: each set's tiers, each battle's opposing deck and tasks
//                                           (data/source/solo_battles.json, tools/pocket_fetch_solo.mjs)
// A deck is included only when the source gives it whole: 20 cards, each one a card this game has, legal under this
// game's deck rules. A deck the source has short or long is left out and listed, never filled in.
//   node tools/gen_pocket_theme_decks.mjs            (writes the files)
//   node tools/gen_pocket_theme_decks.mjs --check    (fails if a file is not what would be written)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { card } from '../pocketenhanced/js/data/cards.js';
import { deckError } from '../pocketenhanced/js/engine/engine.js';
import { parseTask } from '../pocketenhanced/js/solo.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DATA = path.join(ROOT, 'pocketenhanced/js/data'), SRC = path.join(ROOT, 'pocketenhanced/data/source');
const CHECK = process.argv.includes('--check'); let stale = false;
const emit = (name, text) => { const f = path.join(DATA, name); if (CHECK) { const have = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : ''; if (have !== text) { console.error(`${name} is not what the source makes: run node tools/gen_pocket_theme_decks.mjs`); stale = true; } } else fs.writeFileSync(f, text); };
const ORDER = ['Genetic Apex', 'Mythical Island', 'Space-Time Smackdown', 'Triumphant Light', 'Shining Revelry', 'Celestial Guardians', 'Extradimensional Crisis', 'Eevee Grove', 'Wisdom of Sea and Sky', 'Secluded Springs', 'Deluxe Pack: ex', 'Mega Rising', 'Crimson Blaze', 'Fantastical Parade', 'Paldean Wonders', 'Mega Shine', 'Pulsing Aura', 'Paradox Drive', 'Everyday Wonders', 'Ruler of the Skies', "Team Rocket's Ambition", 'Deluxe Pack: Mega', 'Dual Fusion'];
const CODES = ['A1', 'A1a', 'A2', 'A2a', 'A2b', 'A3', 'A3a', 'A3b', 'A4', 'A4a', 'A4b', 'B1', 'B1a', 'B2', 'B2a', 'B2b', 'B3', 'B3a', 'B3b', 'B4', 'B4a', 'B4b', 'C1'];
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const REAL = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
// The source names the TYPES of Pokémon a deck is built around, which are its Energy types except that there is no
// Colorless or Dragon Energy. Those two are dropped; what the deck's own cards ask for is then added, most wanted first
// (the Energy in their attack costs, and the Energy types their effects name), up to three types.
function energyFor(ids, named0) {
	const want = {};
	for (const id of ids.filter(Boolean)) { const c = card(id); for (const a of c.attacks || []) { for (const t of a.cost) if (REAL.includes(t)) want[t] = (want[t] || 0) + 2; for (const t of JSON.stringify(a.fx).match(/Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal/g) || []) want[t] = (want[t] || 0) + 1; } }
	const named = named0.filter(t => REAL.includes(t)), asked = Object.keys(want).sort((x, y) => want[y] - want[x] || REAL.indexOf(x) - REAL.indexOf(y));
	const plain = named.length === named0.length && named.length >= 1 && named.length <= 3;
	return { plain, energy: plain ? named : [...new Set([...named.filter(t => want[t]), ...asked, ...named])].slice(0, 3) };
}
const whyNot = (cards, ids, energy) => { const bad = cards.filter(c => !card(c.id)).map(c => c.id); return cards.length !== 20 ? `the source lists ${cards.length} cards, not 20` : bad.length ? `no such card here: ${bad.join(', ')}` : !energy.length ? 'its cards ask for no Energy type and the source names none' : deckError(ids, energy); };

// ---------- the theme decks ----------
{
	const src = JSON.parse(fs.readFileSync(path.join(SRC, 'theme_decks.json'), 'utf8')), decks = [], left = [];
	for (const d of src.decks) {
		const where = (/\(([^)]*)\)$/.exec(d.title) || [])[1] || d.set || '', set = ORDER.includes(d.set) ? d.set : ORDER.includes(where) ? where : d.set || where;
		const ids = d.cards.map(c => (card(c.id) ? card(c.id).id : null)), { plain, energy } = energyFor(ids, d.energy), why = whyNot(d.cards, ids, energy);
		if (why) { left.push({ deck: d.title, why }); continue; }
		const other = !ORDER.includes(set);   // (the Elite Decks and the three decks tied to no set)
		const highlight = (d.highlight || []).filter(h => card(h) && ids.includes(card(h).id));
		decks.push({ id: 't:' + slug(d.title), name: other && where && where !== 'TCG Pocket' ? `${d.name}: ${where}` : d.name, set: other ? 'Other decks' : set, energy, ...(plain ? {} : { energyFrom: d.energy }), ...(highlight.length ? { highlight } : {}), cards: ids });
	}
	decks.sort((a, b) => (ORDER.indexOf(a.set) + 1 || 99) - (ORDER.indexOf(b.set) + 1 || 99) || a.name.localeCompare(b.name));
	if (new Set(decks.map(d => d.id)).size !== decks.length) throw new Error('two decks share an id');
	emit('theme_decks.js', `// theme_decks.js — GENERATED by tools/gen_pocket_theme_decks.mjs from pocketenhanced/data/source/theme_decks.json. Do not edit.
// The decks Pokémon TCG Pocket itself hands out (its theme decks, lent as rental decks): ${decks.length} of the ${src.decks.length} the source lists.
// Left out, because the source does not give them whole (${left.length}): ${left.map(x => x.deck + ' (' + x.why + ')').join('; ') || 'none'}.
export const THEME_DECKS = Object.freeze([
${decks.map(d => '\t' + JSON.stringify(d)).join(',\n')},
].map(d => Object.freeze({ ...d, energy: Object.freeze(d.energy), cards: Object.freeze(d.cards) })));
`);
	console.log(`theme decks: ${decks.length} of ${src.decks.length}; left out ${left.length}`); for (const x of left) console.log('  left out:', x.deck, '-', x.why);
}

// ---------- the solo battles ----------
{
	const src = JSON.parse(fs.readFileSync(path.join(SRC, 'solo_battles.json'), 'utf8')), TASKS = [], left = [], untracked = new Set(), sets = [];
	const taskNo = t => { let i = TASKS.indexOf(t); if (i < 0) { i = TASKS.length; TASKS.push(t); if (!parseTask(t)) untracked.add(t); } return i; };
	const TIER = n => (/^Beginner/i.test(n) ? 'Beginner' : /^Intermediate/i.test(n) ? 'Intermediate' : /^Advanced/i.test(n) ? 'Advanced' : /^Expert/i.test(n) ? 'Expert' : n);
	let n = 0, all = 0;
	for (const s of src.sets) {
		const code = CODES[ORDER.indexOf(s.set)]; if (!code) throw new Error('unknown set ' + s.set);
		const tiers = [];
		for (const t of s.tiers) {
			const battles = [], tier = TIER(t.name);
			t.battles.forEach((b, i) => {
				all++;
				const ids = b.cards.map(c => (card(c.id) ? card(c.id).id : null)), { energy } = energyFor(ids, b.energy), why = whyNot(b.cards, ids, energy);
				if (why) { left.push({ battle: `${s.set} / ${tier} / ${b.name}`, why }); return; }
				battles.push({ id: `${code}:${tier[0].toLowerCase()}${i + 1}`, name: b.name, energy, cards: ids.join(','), tasks: b.tasks.map(taskNo) }); n++;   // (a battle's id is its place in the source's list, so a battle left out does not renumber the others)
			});
			if (battles.length) tiers.push({ name: tier, battles });
		}
		sets.push({ set: s.set, code, tiers });
	}
	if (untracked.size) { for (const t of untracked) console.error('NOT TRACKED:', t); throw new Error(`${untracked.size} battle task(s) this game cannot read`); }
	emit('solo_battles.js', `// solo_battles.js — GENERATED by tools/gen_pocket_theme_decks.mjs from pocketenhanced/data/source/solo_battles.json. Do not edit.
// Pokémon TCG Pocket's solo battles: ${n} of the ${all} the source lists, in ${sets.length} sets. A battle's cards are its opponent's deck;
// its tasks are numbers into SOLO_TASKS (the source's wording, read by solo.js).
// Left out, because the source does not give the deck whole (${left.length}): ${left.map(x => x.battle + ' (' + x.why + ')').join('; ') || 'none'}.
export const SOLO_TASKS = Object.freeze(${JSON.stringify(TASKS)});
export const SOLO_SETS = Object.freeze([
${sets.map(s => '\t' + JSON.stringify(s)).join(',\n')},
]);
`);
	console.log(`solo battles: ${n} of ${all}; left out ${left.length}; ${TASKS.length} different tasks`);
}
if (stale) process.exit(1);
