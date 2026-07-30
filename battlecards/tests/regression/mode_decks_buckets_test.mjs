// mode_decks_buckets_test.mjs — enemy decklists + player buckets across Dungeon
// Run, Dalaran Heist, and Tombs of Terror stay correct: every referenced card
// resolves, is castable in a colorless deck (no MTG-colored / no lands), no
// tokens in draftable buckets, boss install-secret powers target real secrets,
// and every playable class has a bucket set. Locks the MTG-id-collision fixes.
import fs from 'fs';
import * as Dungeon from '../../dungeon.js';
import * as Heist from '../../heist.js';
import * as Tombs from '../../tombs.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const isColored = d => d && d.colors && d.colors.length;
const classesOf = d => (d.cardClass || 'neutral').split('__');
// the standard HS classes; custom classes (bounty_hunter, centurion, …) are
// designed to borrow cards across classes (e.g. bounty_hunter runs backstab),
// so a cross-class card only signals a real mistake between two STANDARD classes
const STD = new Set(['death_knight', 'demon_hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']);

// ---- explicit deck lists (dungeon bosses + all starter decks) must be clean ----
function scanDeck(label, ids) {
	const bad = [];
	for (const id of ids) {
		const d = byId[id];
		if (!d) bad.push(`${id}:missing`);
		else if (isColored(d)) bad.push(`${id}:colored(${d.colors.join('')})`);
		else if (d.type === 'land') bad.push(`${id}:land`);
	}
	ok(`deck '${label}' has no missing/colored/land cards`, bad.length === 0, bad.join(' '));
}
for (const [bid, boss] of Object.entries(Dungeon.BOSSES)) scanDeck(`dungeon:${bid}`, boss.deck || []);
for (const [cls, deck] of Object.entries(Dungeon.STARTER_DECKS)) scanDeck(`starter:${cls}`, deck);

// ---- boss install-secret powers must target real secret cards ----
for (const [bid, boss] of Object.entries(Dungeon.BOSSES)) {
	for (const e of boss.power?.effects || []) {
		if (e.type === 'install-secret') {
			const d = byId[e.id];
			ok(`dungeon:${bid} install-secret '${e.id}' is a real secret`, !!(d && d.secret), d ? 'not a secret' : 'missing');
		}
	}
}

// ---- themed boss decks (heist + tombs) resolve, are full-size, theme-true ----
for (const [mode, M] of [['heist', Heist], ['tombs', Tombs]]) {
	let worst = 1;
	for (const [bid, boss] of Object.entries(M.BOSSES)) {
		const deck = M.buildBossDeck(byId, boss.theme);
		const bad = deck.filter(id => !byId[id] || isColored(byId[id]));
		ok(`${mode}:${bid} themed deck clean & full`, deck.length >= 20 && bad.length === 0, `len=${deck.length} bad=${bad.join(',')}`);
		const th = boss.theme || {};
		if (th.tribe || th.cardClass) {
			const uniq = [...new Set(deck)];
			const m = uniq.filter(id => { const d = byId[id]; return (!th.tribe || (d.tribe || '').includes(th.tribe)) && (!th.cardClass || (d.cardClass || 'neutral') === th.cardClass); });
			worst = Math.min(worst, m.length / uniq.length);
		}
	}
	ok(`${mode}: every themed deck is >=50% on-theme`, worst >= 0.5, `worst=${Math.round(worst * 100)}%`);
}

// ---- buckets: every used class has one; cards resolve, castable, right class ----
const usedClasses = new Set([
	...Object.keys(Dungeon.STARTER_DECKS),
	...Heist.HEROES.map(h => h.heroClass),
	...Tombs.EXPLORERS.map(e => e.heroClass),
]);
for (const cls of usedClasses) {
	const buckets = Dungeon.BUCKETS[cls];
	ok(`class '${cls}' has buckets`, !!(buckets && buckets.length));
	for (const b of buckets || []) {
		if (b.cards === 'class-all') {
			const n = Object.values(byId).filter(d => (d.cardClass || 'neutral') === cls && !d.token && d.collectible !== false && !isColored(d) && d.type !== 'heropower' && d.type !== 'land').length;
			ok(`${cls}/${b.name}: class-all resolves (>=3)`, n >= 3, n);
			continue;
		}
		const problems = [];
		for (const id of b.cards) {
			const d = byId[id];
			if (!d) { problems.push(`${id}:missing`); continue; }
			if (isColored(d)) problems.push(`${id}:colored`);
			else if (d.token) problems.push(`${id}:token`);
			// note: bounty_hunter/Hero Powers intentionally drafts heropower-type cards (custom class)
			const ccs = classesOf(d);
			// flag a wrong-class card only when both the bucket and the card belong
			// to standard classes (custom classes borrow across classes by design)
			if (STD.has(cls) && !ccs.includes('neutral') && !ccs.includes(cls) && ccs.some(c => STD.has(c))) problems.push(`${id}:class(${d.cardClass})`);
		}
		ok(`bucket ${cls}/${b.name} clean`, problems.length === 0, problems.join(' '));
	}
}

// ---- explicit spot-checks for the fixed collisions ----
ok('azure_drake no longer drafted anywhere (was MTG 2/4)', !JSON.stringify(Dungeon.BUCKETS).includes('azure_drake') && !Object.values(Dungeon.BOSSES).some(b => (b.deck || []).includes('azure_drake')));
ok('wild_growth is a druid card', byId['wild_growth'].cardClass === 'druid');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
