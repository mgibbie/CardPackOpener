// death_sweep_test.mjs — death-sweep characterization BEFORE the PR 12
// engine/death.js extraction. The deathrattle CONTENT is already covered
// heavily (ff suites, goldbeard, guest_ingest); this pins the sweep's own
// bookkeeping: reborn, corpse banking, marked-draw, equipment detach,
// commander retreat, deathrattle double-fire, and died-this-turn tracking.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const KILL = { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] };
const scen = () => new Scenario(byId).def('t_kill', KILL).mana(0, 10);

// --- reborn: first death returns it at 1 health, keyword spent, no grave ---
{
	const { state } = scen()
		.def('t_phoenix', { type: 'creature', cost: 3, attack: 3, health: 4, keywords: ['reborn'] })
		.board(0, ['t_phoenix']).hand(0, ['t_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	const c = state.players[0].board[0];
	ok('reborn: back on board at 1 health', !!c && c.damage === c.maxHealth - 1);
	ok('reborn: keyword spent, no graveyard entry', !c.keywords.includes('reborn')
		&& !state.players[0].graveyard.some(x => x.id === 't_phoenix'));
}
// --- corpses: every friendly death banks one; corpseDouble banks two ---
{
	const { state } = scen()
		.def('t_chaff', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_chaff']).hand(0, ['t_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	ok('death banks a corpse for the owner', state.players[0].corpses === 1);
}
{
	const { state } = scen()
		.def('t_chaff', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_chaff']).hand(0, ['t_kill'])
		.run();
	state.players[0].corpseDouble = true;
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 }, null, 0);
	ok('corpseDouble (Falric): two corpses per death', state.players[0].corpses === 2);
}
// --- marked (markedBy): killer draws 2 on the marked creature's death ---
{
	const { state } = scen()
		.def('t_chaff', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_fill', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.deck(1, Array(4).fill('t_fill'))
		.board(0, ['t_chaff']).hand(0, ['t_kill'])
		.run();
	const victim = state.players[0].board[0];
	victim.marked = true; victim.markedBy = 1;
	const before = state.players[1].hand.length;
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: victim.uid, player: 0 }, null, 0);
	ok('marked: the marker draws 2 on its death', state.players[1].hand.length === before + 2);
}
// --- equipment detaches and stays in play when its bearer dies ---
{
	const { state } = scen()
		.def('t_chaff', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_chaff']).hand(0, ['t_kill'])
		.run();
	const bearer = state.players[0].board[0];
	state.players[0].artifacts.push({ id: 't_axe', uid: 77001, zone: 'artifact', equip: { cost: 1, attack: 2 }, attachedTo: bearer.uid, controller: 0 });
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: bearer.uid, player: 0 }, null, 0);
	const axe = state.players[0].artifacts.find(a => a.uid === 77001);
	ok('equipment detaches on bearer death, stays in play', !!axe && axe.attachedTo === null);
}
// --- commander: retreats to command zone with +2 tax instead of graveyard ---
{
	const { state } = scen()
		.def('t_cmd', { type: 'creature', cost: 4, attack: 4, health: 4, commander: true })
		.board(0, ['t_cmd']).hand(0, ['t_kill'])
		.run();
	// the commander flag is set by createGame's loadout path, NOT copied by
	// instantiate — mark the instance the way a real loadout commander is
	const cmd = state.players[0].board[0];
	cmd.commander = true;
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: cmd.uid, player: 0 }, null, 0);
	const p = state.players[0];
	ok('commander: retreats to command zone at +2 cost', p.command.some(c => c.id === 't_cmd' && c.cost === 6)
		&& !p.graveyard.some(c => c.id === 't_cmd'));
}
// --- deathrattle double-fire: player flag OR a live Rivendare-style minion ---
{
	const { state } = scen()
		.def('t_rattler', { type: 'creature', cost: 2, attack: 1, health: 1, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 1 }] })
		.board(0, ['t_rattler']).hand(0, ['t_kill'])
		.run();
	state.players[0].deathrattlesTwice = true;
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 }, null, 0);
	ok('deathrattlesTwice: rattle fires twice', state.players[0].armor === 2);
}
{
	const { state } = scen()
		.def('t_rattler', { type: 'creature', cost: 2, attack: 1, health: 1, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 1 }] })
		.def('t_riven', { type: 'creature', cost: 4, attack: 1, health: 7, rattleDouble: true })
		.board(0, ['t_rattler', 't_riven']).hand(0, ['t_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	ok('rattleDouble minion: rattle fires twice', state.players[0].armor === 2);
}
// --- died-this-turn bookkeeping feeds resurrection pools ---
{
	const { state } = scen()
		.def('t_chaff', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_chaff']).hand(0, ['t_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	const p = state.players[0];
	ok('death log: diedThisTurnIds + deathLogIds + diedCountById', p.diedThisTurnIds.includes('t_chaff')
		&& p.deathLogIds.includes('t_chaff') && p.diedCountById['t_chaff'] === 1
		&& state.minionsDiedGame === 1);
}
// --- death triggers: creature-died fires for every player, friendly- for the owner ---
{
	const { state } = scen()
		.def('t_chaff', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_watcher', { type: 'creature', cost: 2, attack: 2, health: 2, ongoing: { on: 'creature-died', effects: [{ type: 'armor', value: 1 }] } })
		.def('t_mourner', { type: 'creature', cost: 2, attack: 2, health: 2, ongoing: { on: 'friendly-creature-died', effects: [{ type: 'armor', value: 2 }] } })
		.board(0, ['t_chaff', 't_mourner']).board(1, ['t_watcher']).hand(0, ['t_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	ok('creature-died: enemy watcher armors up', state.players[1].armor === 1);
	ok('friendly-creature-died: only the owner mourns', state.players[0].armor === 2);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
