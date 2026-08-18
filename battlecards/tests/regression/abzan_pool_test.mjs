// Abzan advanced-land pool: the Abzan Citadel (a COLORLESS advanced land) Discovers from a
// pool of 15 W/B/G "Abzan" cards. Covers the flip (land colorless, pool colored), the 7
// newly-built cards, and the themed `discover match:'Abzan'` (which must include colored cards).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._c = { id: '_c', name: 'C', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(4), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.life = 30; }
	st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};
const toHand = (st, id) => { const c = E.instantiate(byId[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); return c; };
const putC = (st, pi, atk = 2, hp = 3) => { const c = E.instantiate({ id: '_c', name: 'C', type: 'creature', cost: 1, attack: atk, health: hp, rarity: 'common' }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, id, target) => E.playCard(st, 0, st.players[0].hand.find(x => x.id === id).uid, target || null);

// ---------- structure: flip + 15-card pool ----------
ok('Abzan Citadel is colorless', !(byId.abzan_citadel.colors || []).length);
ok('Abzan Citadel Discovers (not conjures)', byId.abzan_citadel.taps.some(t => t.effects.some(e => e.type === 'discover' && e.match === 'Abzan')));
const abzan = raw.cards.filter(c => /abzan/i.test(c.name) && c.type !== 'land');
ok('15 non-land Abzan cards exist', abzan.length === 15, abzan.length);
ok('every pool card is W/B/G', abzan.every(c => JSON.stringify([...(c.colors || [])].sort()) === '["B","G","W"]'));

// ---------- the themed discover offers Abzan cards, INCLUDING the colored ones ----------
{
	const st = game();
	E.execEffects(st, 0, [{ type: 'discover', match: 'Abzan', pick: 3 }], null, null);
	const pq = st.pickQueue[0];
	ok('discover queued a pick', !!pq);
	ok('discover offered 3 Abzan cards', pq && pq.ids.length === 3 && pq.ids.every(id => /abzan/i.test(byId[id]?.name || '')), pq?.ids);
	ok('discover pool includes colored cards (would be excluded without match)', pq && pq.ids.some(id => (byId[id]?.colors || []).length));
}

// ---------- the 7 newly-built cards work ----------
{ const st = game(); st.players[0].deck = ['_c', '_c', '_c']; toHand(st, 'abzan_warlord'); const h = st.players[0].hand.length; play(st, 'abzan_warlord');
  ok('Warlord: Battlecry drew 2', st.players[0].hand.length === h - 1 + 2); }
{ const st = game(); toHand(st, 'abzan_survivalist'); play(st, 'abzan_survivalist'); const s = st.players[0].board.find(c => c.id === 'abzan_survivalist');
  ok('Survivalist: Rush + Ward 4', s.keywords.includes('rush') && s.ward?.mana === 4);
  const foe = putC(st, 1, 2, 8); st.players[0].mana = { cur: 6, max: 6, bonus: 0 };
  E.activateAbility(st, 0, s.uid, 0, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Survivalist: X-damage hit for remaining mana', E.hp(foe) <= 3, E.hp(foe)); }
{ const st = game(); toHand(st, 'abzan_battlepriest'); play(st, 'abzan_battlepriest'); const bp = st.players[0].board.find(c => c.id === 'abzan_battlepriest'); const a = putC(st, 0, 2, 2);
  E.activateAbility(st, 0, bp.uid, 0, { type: 'creature', uid: a.uid, player: 0 });
  ok('Battlepriest: activated +1/+1', a.attack === 3 && E.hp(a) === 3); }
{ const st = game(); const a = putC(st, 0, 2, 2); toHand(st, 'abzan_runemark'); play(st, 'abzan_runemark', { type: 'creature', uid: a.uid, player: 0 });
  ok('Runemark: +2/+2 & Taunt', a.attack === 4 && E.hp(a) === 4 && a.keywords.includes('taunt')); }
{ const st = game(); const a = putC(st, 0, 2, 2); toHand(st, 'abzan_sand_blessing'); play(st, 'abzan_sand_blessing'); E.recomputeAuras(st);
  ok('Sand Blessing: anthem grants your creatures Taunt', E.has(a, 'taunt')); }
{ const st = game(); st.players[0].deck = ['_c']; const a = putC(st, 0, 2, 2); toHand(st, 'abzan_strike'); const h = st.players[0].hand.length;
  play(st, 'abzan_strike', { type: 'creature', uid: a.uid, player: 0 });
  ok('Strike: +1/+0 this turn', a.attack === 3);
  ok('Strike: added a random Abzan card', st.players[0].hand.some(c => /abzan/i.test(c.name || ''))); }
{ const st = game(); const fe = E.instantiate(byId.abzan_sand_blessing, 1); fe.zone = 'board'; st.players[1].board.push(fe); const a = putC(st, 0, 2, 2); toHand(st, 'abzan_advantage');
  play(st, 'abzan_advantage', { type: 'creature', uid: a.uid, player: 0 });
  ok('Advantage: buffed a friendly creature +1/+1', a.attack === 3 && E.hp(a) === 3); }

console.log(`${pass}/${pass + fail} abzan pool checks passed`);
process.exit(fail ? 1 : 0);
