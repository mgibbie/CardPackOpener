// Hero-power family under the ADDITIVE house rule: Shadowform, Metamorphosis,
// Story of Sulfuras gain a NEW power (never replacing) up to the 3-power cap,
// where you pick one to discard (resolvePick discardPower). power.uses = N
// powers vanish after N activations.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_filler = { id: 't_filler', name: 'Filler', type: 'creature', cost: 1, attack: 1, health: 1 };

function game() {
	const st = E.createGame(byId, seededRng(31), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(20).fill('t_filler'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function cast(st, id) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, null, null, 0); return sp;
}
function usePower(st, powerId, tgt) {
	const p = st.players[0];
	const pw = p.heroPowers.find(c => c.id === powerId);
	if (!pw) return false;
	p.mana.cur = 10;
	return E.useHeroPower(st, 0, pw.uid, tgt, null);
}
const powerIds = st => st.players[0].heroPowers.map(c => c.id);
function fullRound(st) { E.endTurn(st); E.endTurn(st); st.players[0].mana.cur = 10; }

// --- additive: Shadowform ADDS Mind Spike (no replacement), and it works ---
{
	const st = game();
	cast(st, 'shadowform');
	ok('shadowform: Mind Spike added', powerIds(st).includes('hp_mind_spike'), powerIds(st));
	const life = st.players[1].life;
	usePower(st, 'hp_mind_spike', { type: 'hero', player: 1 });
	ok('mind spike: dealt 2', st.players[1].life === life - 2, life - st.players[1].life);
	ok('mind spike: unlimited — still there', powerIds(st).includes('hp_mind_spike'));
}
// --- limited uses: Demonic Blast vanishes after 2 activations ---
{
	const st = game();
	cast(st, 'metamorphosis');
	ok('metamorphosis: Demonic Blast added', powerIds(st).includes('hp_demonic_blast'), powerIds(st));
	const life = st.players[1].life;
	usePower(st, 'hp_demonic_blast', { type: 'hero', player: 1 });
	ok('blast use 1: dealt 5, still present', st.players[1].life === life - 5 && powerIds(st).includes('hp_demonic_blast'));
	fullRound(st);
	usePower(st, 'hp_demonic_blast', { type: 'hero', player: 1 });
	ok('blast use 2: dealt 10 total, VANISHED', st.players[1].life === life - 10 && !powerIds(st).includes('hp_demonic_blast'), powerIds(st));
}
// --- DIE, INSECT!: 8 to a random enemy, vanishes after 2 uses ---
{
	const st = game();
	cast(st, 'story_of_sulfuras');
	const life = st.players[1].life;
	usePower(st, 'hp_die_insect', null);
	ok('die insect: 8 to the enemy hero (only enemy)', st.players[1].life === life - 8, life - st.players[1].life);
	fullRound(st);
	usePower(st, 'hp_die_insect', null);
	ok('die insect: gone after 2 uses', !powerIds(st).includes('hp_die_insect'), powerIds(st));
}
// --- the 3-power cap: pick one to discard for the newcomer ---
{
	const st = game();
	cast(st, 'metamorphosis'); cast(st, 'story_of_sulfuras'); cast(st, 'shadowform');
	ok('cap setup: 3 powers', st.players[0].heroPowers.length === 3, powerIds(st));
	cast(st, 'metamorphosis'); // at the cap -> pick
	ok('cap: pick queued instead of a 4th power', st.pickQueue.length === 1 && st.pickQueue[0].discardPower === true && st.players[0].heroPowers.length === 3);
	ok('cap: choices are your current powers', JSON.stringify(st.pickQueue[0].ids.slice().sort()) === JSON.stringify(['hp_demonic_blast', 'hp_die_insect', 'hp_mind_spike']));
	E.resolvePick(st, 'hp_mind_spike'); // discard Mind Spike for the new Blast
	ok('cap: discarded pick is gone, newcomer in, still 3', st.players[0].heroPowers.length === 3 && !powerIds(st).includes('hp_mind_spike') && powerIds(st).filter(x => x === 'hp_demonic_blast').length === 2, powerIds(st));
}

// --- legacy set-hero-power now ADDS (Dinomancy) + Yoink's discover flow ---
{
	const st = game();
	cast(st, 'shadowform');
	cast(st, 'dinomancy');
	ok('dinomancy: ADDS a power (never replaces)', powerIds(st).length === 2 && powerIds(st).includes('hp_dinomancy') && powerIds(st).includes('hp_mind_spike'), powerIds(st));
	cast(st, 'yoink');
	ok('yoink: discover queued with cost 0 / 2 uses riding along', st.pickQueue.length === 1 && st.pickQueue[0].heroPower === true && st.pickQueue[0].powerSetCost === 0 && st.pickQueue[0].powerUses === 2);
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	const yp = st.players[0].heroPowers[st.players[0].heroPowers.length - 1];
	ok('yoink: picked power added FREE with 2 uses', st.players[0].heroPowers.length === 3 && yp.power.cost === 0 && yp.power.uses === 2, [yp.id, yp.power.cost, yp.power.uses]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
