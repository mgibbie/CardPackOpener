// Two "undefined" labels from the 2026-11 Middle-earth reports.
// A) bug:1793635342471 — Mosswood Dreadknight's Adventure chooser read "Summon ... (3/undefined)":
//    openAdventureMenu printed card.health, but an instantiated card keeps its Health in
//    maxHealth (there is no .health on an instance).
// B) bug:1793975867085 — Poison Seeds logged "undefined was transformed into Treant" x4: the
//    'transformed' events from transform-all-into-token (and heist's legendary roll) carried no
//    `from`, which game.js's log line prints.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._mystic = { id: '_mystic', name: 'Kezan Mystic', type: 'creature', cost: 4, attack: 4, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

// A) the chooser label: evaluate the exact template from game.js against a real instance
{
	const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
	const fn = src.slice(src.indexOf('function openAdventureMenu'));
	const m = fn.match(/cbtn\.innerHTML = `[^`]*Summon \$\{card\.name\} \((\$\{[^}]+\})\/(\$\{[^}]+\})\)`/);
	ok('found the summon label template', !!m);
	const st = E.createGame(byId, seededRng(1), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	const card = E.instantiate(byId.mosswood_dreadknight, 0);
	if (m) {
		const label = new Function('card', 'return `' + m[1] + '/' + m[2] + '`;')(card);
		ok('Mosswood Dreadknight\'s summon option reads 3/2', label === '3/2', label);
	}
	void st;
}

// B) Poison Seeds: every 'transformed' event names the creature it replaced
{
	const st = E.createGame(byId, seededRng(2), null, 2, [{ id: 'druid', name: 'Galadriel', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	for (const pi of [0, 1]) for (let i = 0; i < 2; i++) { const c = E.instantiate(byId._mystic, pi); c.zone = 'board'; st.players[pi].board.push(c); }
	const ev0 = st.events.length;
	E.execEffects(st, 0, byId.poison_seeds.effects, null, null);
	const tr = st.events.slice(ev0).filter(e => e.type === 'transformed');
	ok('four creatures became Treants', tr.length === 4 && st.players.every(p => p.board.every(c => c.name === 'Treant')), tr.length);
	ok('each transformed event names the original creature', tr.every(e => e.from === 'Kezan Mystic'), JSON.stringify(tr.map(e => e.from)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
