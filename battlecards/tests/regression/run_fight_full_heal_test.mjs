// Wish "Fully heal your hero" in a scaled Middle-earth round (bug:1793636524105).
// DIAGNOSIS: heal-hero-full restores to p.maxLife ?? STARTING_LIFE (40). Run fights start both
// sides at runLifeFor(round) = 10 + 5*(round-1); setRunLife set maxLife only for the
// dungeon-style modes ({full:true}), so in every climb (Duels/Lorequest/Middle-earth/Sword
// Coast/FF/Multiverse/Arena) "full" meant a fixed 40 unrelated to the fight: round 1 Wish
// healed 10 -> 40, round 11 (60 life) at 54 healed nothing. Ordinary healing is uncapped by
// design (damage.js healHero: "starting life is not a ceiling") and stays that way.
// FIX: setRunLife always records the fight's starting life as maxLife (the full-heal reference),
// exactly what Dungeon/Heist/Tombs already did. The balance sim mirrors it.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

// run game.js's own runLifeFor + setRunLife against an engine state
const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = name => { const i = src.indexOf(`function ${name}(`); return src.slice(i, src.indexOf('\n}\n', i) + 3); };
// game.js keeps its shared state on GS (game_state.js), so the lifted functions get a GS of their own
const make = new Function('GS', 'log', grab('runLifeFor') + grab('setRunLife') + '; return (st, r, o) => { GS.state = st; setRunLife(r, o); };');
const setRunLife = make({ HUMAN: 0 }, () => {});

function fight(round) {
	const st = E.createGame(byId, seededRng(4), null, 2, [{ id: 'priest', name: 'Gandalf', power: null }, { id: 'warrior', name: 'Gollum', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	setRunLife(st, round); // the climbs' call: no opts
	return st;
}
const wish = byId.wish || raw.cards.find(c => c.name === 'Wish');
ok('Wish carries heal-hero-full', !!wish && JSON.stringify(wish.effects).includes('heal-hero-full'));
const fullHeal = (st, pi) => E.execEffects(st, pi, [{ type: 'heal-hero-full' }], null, null);

// round 11: both start at 60; at 54 a full heal restores to 60
{
	const st = fight(11);
	ok('round 11 starts at 60 with maxLife 60', st.players[0].life === 60 && st.players[0].maxLife === 60, [st.players[0].life, st.players[0].maxLife]);
	st.players[0].life = 54;
	fullHeal(st, 0);
	ok('round 11: Fully heal 54 -> 60 (the fight\'s full life)', st.players[0].life === 60, st.players[0].life);
}
// round 1: both start at 10; a full heal from 4 restores to 10, not 40
{
	const st = fight(1);
	st.players[0].life = 4;
	fullHeal(st, 0);
	ok('round 1: Fully heal 4 -> 10 (not the constant-mode 40)', st.players[0].life === 10, st.players[0].life);
}
// ordinary healing is still uncapped above the starting life
{
	const st = fight(3);
	E.execEffects(st, 0, [{ type: 'heal', target: 'self', value: 5 }], null, null);
	ok('ordinary healing still goes above the starting life (20 + 5)', st.players[0].life === 25, st.players[0].life);
	fullHeal(st, 0);
	ok('a full heal never LOWERS life that is above full', st.players[0].life === 25, st.players[0].life);
}
// the balance sim mirrors it
{
	const sim = fs.readFileSync(new URL('../../../tools/runmode-sim.mjs', import.meta.url), 'utf8');
	ok('runmode-sim sets maxLife with the run life', /p\.life = runLife\(round\); p\.maxLife = p\.life;/.test(sim));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
