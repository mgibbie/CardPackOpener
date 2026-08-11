// Timed-aura family ("Lasts 3 turns" spells): Dun Baldar Bridge, Crusader Aura,
// Sandfury Aura, Celestial Aura, Reinforcement Aura, Chronological Aura (paladin)
// + Snowfall Graveyard (rogue). Engine surface: timed-aura carries ongoing /
// rattleDouble / endTurnTwice, aura.soloSet, summon-from-deck maxCost.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_body = { id: 't_body', name: 'Body', type: 'creature', cost: 1, attack: 2, health: 3 };
byId.t_cheap = { id: 't_cheap', name: 'Cheap', type: 'creature', cost: 1, attack: 1, health: 1 };
byId.t_pricey = { id: 't_pricey', name: 'Pricey', type: 'creature', cost: 5, attack: 5, health: 5 };
byId.t_ticker = { id: 't_ticker', name: 'Ticker', type: 'creature', cost: 1, attack: 1, health: 4, ongoing: { on: 'turn-end', effects: [{ type: 'armor', value: 1 }] } };
byId.t_rattler = { id: 't_rattler', name: 'Rattler', type: 'creature', cost: 1, attack: 1, health: 1, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 1 }] };

function game() {
	const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function cast(st, id) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, null, null, 0); return sp;
}
// run to the start of p0's next turn (p0 end -> p1 end)
function fullRound(st) { E.endTurn(st); E.endTurn(st); }

// --- Dun Baldar Bridge: minions you create get +2/+2, expires after 3 turns ---
{
	const st = game();
	cast(st, 'dun_baldar_bridge');
	ok('bridge: enchantment in play', st.players[0].enchantments.some(e => e.name === 'Dun Baldar Bridge'));
	const before = put(st, 0, 't_body'); // put() bypasses play - summon() path below is the real check
	const c = E.instantiate(byId.t_body, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	E.playCard(st, 0, c.uid, null, null, 0);
	const played = st.players[0].board.find(x => x.uid === c.uid);
	ok('bridge: played minion got +2/+2', played.attack === 4 && played.maxHealth === 5, [played.attack, played.maxHealth]);
	fullRound(st); fullRound(st); fullRound(st);
	ok('bridge: expired after 3 of your turns', !st.players[0].enchantments.some(e => e.name === 'Dun Baldar Bridge'));
	const c2 = E.instantiate(byId.t_body, 0); c2.zone = 'hand'; st.players[0].hand.push(c2); st.players[0].mana.cur = 10;
	E.playCard(st, 0, c2.uid, null, null, 0);
	const late = st.players[0].board.find(x => x.uid === c2.uid);
	ok('bridge: no buff after expiry', late.attack === 2 && late.maxHealth === 3, [late.attack, late.maxHealth]);
}
// --- Crusader Aura: attacking friendly minions get +2/+1 ---
{
	const st = game();
	const atk = put(st, 0, 't_body');
	put(st, 1, 't_pricey');
	cast(st, 'crusader_aura');
	E.attack(st, 0, atk.uid, { type: 'creature', uid: st.players[1].board[0].uid, player: 1 });
	ok('crusader: attacker got +2/+1', atk.attack === 4 && atk.maxHealth === 4, [atk.attack, atk.maxHealth]);
}
// --- Sandfury Aura: minions' end-of-turn effects trigger twice ---
{
	const st = game();
	put(st, 0, 't_ticker');
	E.endTurn(st); // armor is read right after MY end — it decays at my next turn start
	const base = st.players[0].armor;
	ok('sandfury baseline: turn-end fired once', base === 1, base);
	E.endTurn(st); // opponent passes; armor resets when my turn starts
	cast(st, 'sandfury_aura');
	E.endTurn(st);
	ok('sandfury: end-of-turn effect fired TWICE', st.players[0].armor === 2, st.players[0].armor);
}
// --- Celestial Aura: exactly-one-minion set to 10/10, lapses with a second ---
{
	const st = game();
	const solo = put(st, 0, 't_body');
	cast(st, 'celestial_aura');
	E.recomputeAuras(st);
	ok('celestial: lone minion set to 10/10', solo.attack === 10 && solo.maxHealth === 10, [solo.attack, solo.maxHealth]);
	put(st, 0, 't_cheap'); // a second minion — the set lapses
	ok('celestial: lapses with a second minion', solo.attack === 2 && solo.maxHealth === 3, [solo.attack, solo.maxHealth]);
	st.players[0].board = st.players[0].board.filter(c => c.id !== 't_cheap');
	E.recomputeAuras(st);
	ok('celestial: re-applies when alone again', solo.attack === 10 && solo.maxHealth === 10, [solo.attack, solo.maxHealth]);
}
// --- Reinforcement Aura: end of turn, summon <=2-cost from DECK ---
{
	const st = game();
	st.players[0].deck = ['t_pricey', 't_cheap']; // findIndex scans from the top; only the 1-cost qualifies
	cast(st, 'reinforcement_aura');
	E.endTurn(st);
	ok('reinforcement: cheap minion summoned from deck', st.players[0].board.some(c => c.id === 't_cheap'));
	ok('reinforcement: pricey minion stayed in deck', st.players[0].deck.includes('t_pricey') && !st.players[0].board.some(c => c.id === 't_pricey'));
}
// --- Chronological Aura: end of turn, create a 3/5 Taunt Dragon ---
{
	const st = game();
	cast(st, 'chronological_aura');
	E.endTurn(st);
	const drg = st.players[0].board.find(c => c.name === 'Timewarped Dragon');
	ok('chronological: 3/5 Taunt Dragon created', !!drg && drg.attack === 3 && drg.maxHealth === 5 && drg.keywords.includes('taunt') && (drg.tribe || '').includes('Dragon'), drg && [drg.attack, drg.maxHealth]);
}
// --- Snowfall Graveyard: deathrattles trigger twice while it lasts ---
{
	const st = game();
	const r = put(st, 0, 't_rattler');
	cast(st, 'snowfall_graveyard');
	r.damage = r.maxHealth; E.sweepDeaths(st);
	ok('snowfall: deathrattle fired twice', st.players[0].armor === 2, st.players[0].armor);
	fullRound(st); fullRound(st); fullRound(st);
	ok('snowfall: expired after 3 turns', !st.players[0].enchantments.some(e => e.name === 'Snowfall Graveyard'));
	const r2 = put(st, 0, 't_rattler');
	const armorBefore = st.players[0].armor;
	r2.damage = r2.maxHealth; E.sweepDeaths(st);
	ok('snowfall: single rattle after expiry', st.players[0].armor === armorBefore + 1, st.players[0].armor - armorBefore);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
