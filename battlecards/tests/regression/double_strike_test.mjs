// Double Strike (new combat primitive, ported for MTG Turbo-Thwacking Auto-Hammer): a creature
// with double_strike deals its combat damage TWICE — it strikes first (first-strike timing) and
// then strikes again, so it can kill a defender before taking any hit back.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(2), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.life = 30; }
	return st;
};
let uid = 0;
const putC = (st, pi, atk, hpv, kws = []) => {
	const c = E.instantiate({ id: '_c' + (uid++), name: 'C', type: 'creature', cost: 1, attack: atk, health: hpv }, pi);
	c.zone = 'board'; c.sick = false; c.keywords = [...kws]; st.players[pi].board.push(c); return c;
};
const fight = (st, a, d) => E.resolveCombat(st, 0, a.uid, { type: 'creature', uid: d.uid, player: 1 });

// double strike lands two hits and kills before retaliation
{ const st = game();
  const a = putC(st, 0, 3, 3, ['double_strike']); // 3/3 double strike -> 6 total
  const d = putC(st, 1, 2, 6);                     // 2/6
  fight(st, a, d);
  ok('double strike hits twice: 6 to a 6-hp defender -> dies', E.isDead(d));
  ok('double striker takes NO retaliation (killed it first)', E.hp(a) === 3, E.hp(a)); }

// control: a vanilla creature hits once and takes retaliation
{ const st = game();
  const a = putC(st, 0, 3, 3);
  const d = putC(st, 1, 2, 6);
  fight(st, a, d);
  ok('vanilla hits once: defender survives at 3', !E.isDead(d) && E.hp(d) === 3, E.hp(d));
  ok('vanilla takes retaliation (2 back)', E.hp(a) === 1, E.hp(a)); }

// double strike vs a defender that survives both hits still takes exactly one retaliation
{ const st = game();
  const a = putC(st, 0, 2, 5, ['double_strike']); // deals 2 + 2 = 4
  const d = putC(st, 1, 3, 7);
  fight(st, a, d);
  ok('double strike dealt 4 to a 7-hp defender', E.hp(d) === 3, E.hp(d));
  ok('surviving defender retaliates once (3 back)', E.hp(a) === 2, E.hp(a)); }

// regression: plain first strike is unchanged (strikes first, defender only retaliates if alive)
{ const st = game();
  const a = putC(st, 0, 3, 3, ['first_strike']);
  const d = putC(st, 1, 4, 3); // its 4 would kill the attacker, but it dies first
  fight(st, a, d);
  ok('first strike unchanged: defender dies before retaliating, attacker unhurt', E.isDead(d) && E.hp(a) === 3); }

// Turbo-Thwacking Auto-Hammer contraption grants Double Strike to a friendly creature
{ const st = game();
  const c = putC(st, 0, 2, 3);
  st.players[0].sprocket = [null, null, null]; st.players[0].sprocketPointer = 0;
  E.placeContraption(st, 0, 0, 'contraption_turbo_thwacking_auto_hammer');
  E.crankSprocket(st, 0);
  ok('Turbo-Thwacking grants double_strike to a friendly', c.keywords.includes('double_strike'), c.keywords); }

console.log(`${pass}/${pass + fail} double strike checks passed`);
process.exit(fail ? 1 : 0);
