// landfall_triggers_test.mjs (2026-09-08)
// Landfall must fire in BOTH land-enter cases (owner request):
//   1. developing a basic land into an empty slot (buyLand)
//   2. upgrading a slot's land into a different land (upgradeLand)
// Both route through the shared landEntered() hook, which fires the 'landfall'
// ongoing — verified here with a Landfall creature (Canopy Gorger: +2/+2).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(cardsById, seededRng(55), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.lands = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const putGorger = st => { const g = E.instantiate(cardsById.canopy_gorger, 0); g.zone = 'board'; st.players[0].board.push(g); return g; }; // 6/5, Landfall +2/+2

// ---------- 1. develop a basic into an empty slot ----------
{
	const st = game();
	const g = putGorger(st);
	const ok1 = E.buyLand(st, 0, 'forest'); // 3 mana, blank slot -> Forest
	ok('buyLand developed a Forest', ok1 === true && st.players[0].lands.some(l => l.id === 'forest'));
	ok('Landfall fired on developing a land (6/5 -> 8/7)', g.attack === 8 && g.maxHealth === 7, [g.attack, g.maxHealth]);
}

// ---------- 2. upgrade a slot's land into a different land ----------
{
	const st = game();
	const g = putGorger(st);
	// build a color identity that covers some advanced land, then upgrade into it
	const BASIC_FOR = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };
	const pool = raw.cards.filter(d => d.type === 'land');
	const isBasic = id => ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'].includes(id);
	const landColors = d => { const s = new Set(); for (const t of (d.taps || [])) for (const e of (t.effects || [])) if (e.type === 'boost' && e.color) s.add(e.color); return s; };
	const adv = pool.find(d => !isBasic(d.id) && landColors(d).size >= 1 && [...landColors(d)].every(c => BASIC_FOR[c]));
	ok('found an advanced land to upgrade into', !!adv, adv && adv.id);
	const cols = [...landColors(adv)];
	// one basic per color the advanced land needs -> identity covers it; upgrade the first (shares a color)
	st.players[0].lands = cols.map(c => { const l = E.instantiate(cardsById[BASIC_FOR[c]], 0); l.zone = 'land'; return l; });
	const toUpgrade = st.players[0].lands[0];
	const options = E.availableUpgrades(st, 0, toUpgrade.uid);
	ok('the advanced land is a legal upgrade', options.some(d => d.id === adv.id), options.map(d => d.id).slice(0, 5));
	const before = { a: g.attack, h: g.maxHealth };
	const ok2 = E.upgradeLand(st, 0, toUpgrade.uid, adv.id);
	ok('upgradeLand swapped the slot into the advanced land', ok2 === true && st.players[0].lands.some(l => l.id === adv.id));
	ok('Landfall fired on upgrading a land (+2/+2)', g.attack === before.a + 2 && g.maxHealth === before.h + 2, [before, g.attack, g.maxHealth]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
