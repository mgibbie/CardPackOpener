// Thirtieth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Verdant Vessel ({T} artifact) -> "fix the tap symbol": {T} must render as a
//     tap PIP, not the literal text "{T}". Fixed at the renderer so every {T}
//     artifact benefits.
//   Axebane Stag -> add "Connect: Gain +2/+2" (self-hit-player -> +2/+2).
import fs from 'fs';
import * as E from '../../engine.js';
import { richTokens } from '../../keywords.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 73) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- {T} renders as a tap pip (renderer fix) ----------
{
	const toks = richTokens('{T}: Target creature gains +1/+1.');
	const tap = toks.find(t => t.kind === 'sym' && t.key === 'tap');
	ok('{T} becomes a tap symbol pip', !!tap, JSON.stringify(toks.slice(0, 3)));
	ok('the literal text "{T}" is not emitted as a word', !toks.some(t => t.kind === 'word' && /\{T\}/.test(t.text)), JSON.stringify(toks.filter(t => t.kind === 'word').map(t => t.text)));
	// ⟳ (the location notation) still works too
	const loc = richTokens('⟳: Draw a card.');
	ok('⟳ still renders as a tap pip', loc.some(t => t.kind === 'sym' && t.key === 'tap'), JSON.stringify(loc.slice(0, 2)));
	// Verdant Vessel is a {T} artifact — sanity that its text uses {T}
	ok('Verdant Vessel description uses {T}', /\{T\}/.test(cardsById.cowl_prowler.description), cardsById.cowl_prowler.description);
}

// ---------- Axebane Stag: Connect: Gain +2/+2 ----------
{
	const c = cardsById.axebane_stag;
	// (batch 36 later added the "Battlecry: Destroy target opponent's weapon." line)
	ok('Axebane Stag description ends with "Connect: Gain +2/+2."', c.description.endsWith('Connect: Gain +2/+2.'), JSON.stringify(c.description));
	ok('Connect is a self-hit-player +2/+2 trigger', c.ongoing?.on === 'self-hit-player' && c.ongoing.effects[0].type === 'buff-self' && c.ongoing.effects[0].attack === 2 && c.ongoing.effects[0].health === 2, JSON.stringify(c.ongoing));

	// FIRE it: hitting the enemy hero grows it +2/+2 (base 4/5 -> 6/7)
	const st = game();
	const stag = put(st, 0, E.instantiate(c, 0));
	const a0 = stag.attack, h0 = stag.maxHealth;
	E.attack(st, 0, stag.uid, { type: 'hero', player: 1 });
	ok(`Connect grew the Stag +2/+2 on hitting the hero (${a0}/${h0} -> ${a0 + 2}/${h0 + 2})`, stag.attack === a0 + 2 && stag.maxHealth === h0 + 2, [stag.attack, stag.maxHealth]);

	// attacking a CREATURE (no player damage) must NOT trigger Connect
	const st2 = game();
	const stag2 = put(st2, 0, E.instantiate(c, 0));
	const wall = put(st2, 1, E.instantiate({ id: 'w', name: 'W', type: 'creature', cost: 2, attack: 0, health: 6 }, 1));
	const b0 = stag2.attack;
	E.attack(st2, 0, stag2.uid, { type: 'creature', uid: wall.uid, player: 1 });
	ok('Connect does NOT fire when it attacks a creature', stag2.attack === b0, [b0, stag2.attack]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
