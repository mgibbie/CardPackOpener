// Owner inbox batch, 2026-09-17.
//   Diregraf Ghoul  -> "Rush.\nAvenge 1: Gain +1 Attack." (canonical Avenge, like Flag Runner)
//   Faerie Miscreant-> Alliance reworded "Gain +1/+0" -> "Gain +1 Attack" (same buff)
//   Spell Snare     -> "Counter target spell with mana value 2 or less." (new manaValueMax)
//   Vapor Snag      -> "That player" -> "Its controller loses 1 Life." (same effect)
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { seededRng } from '../../engine/rng.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._bear = { id: '_bear', name: 'Bear', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(917), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Diregraf Ghoul: Avenge 1 -> +1 Attack on each friendly death ----
{
	const c = byId.diregraf_ghoul;
	ok('description "Rush.\\nAvenge 1: Gain +1 Attack."', c.description === 'Rush.\nAvenge 1: Gain +1 Attack.', c.description);
	const t = (c.ongoings || [])[0];
	ok('canonical Avenge 1 (friendly-creature-died, every:1, buff-self +1/0)',
		t && t.on === 'friendly-creature-died' && t.every === 1 && t.effects[0].type === 'buff-self' && t.effects[0].attack === 1 && (t.effects[0].health || 0) === 0, JSON.stringify(c.ongoings));
	ok('no stale singular `ongoing` left behind', !c.ongoing, JSON.stringify(c.ongoing));
	ok('keeps Rush', (c.keywords || []).includes('rush'));
	const st = fresh();
	const g = put(st, 0, c);
	ok('starts at 2 Attack', g.attack === 2, g.attack);
	fireOngoing(st, 0, 'friendly-creature-died', { dead: E.instantiate(byId._bear, 0) });
	ok('one friendly death -> +1 Attack (2->3)', g.attack === 3, g.attack);
	fireOngoing(st, 0, 'friendly-creature-died', { dead: E.instantiate(byId._bear, 0) });
	ok('re-triggers every death (3->4)', g.attack === 4, g.attack);
}

// ---- 2) Faerie Miscreant: Alliance -> Gain +1 Attack (same +1/+0 buff) ----
{
	const c = byId.faerie_miscreant;
	ok('description "Elusive.\\nAlliance: Gain +1 Attack."', c.description === 'Elusive.\nAlliance: Gain +1 Attack.', c.description);
	ok('Alliance is a creature-played buff-self +1/0',
		c.ongoing && c.ongoing.on === 'creature-played' && c.ongoing.effects[0].type === 'buff-self' && c.ongoing.effects[0].attack === 1 && (c.ongoing.effects[0].health || 0) === 0, JSON.stringify(c.ongoing));
	ok('keeps Elusive', (c.keywords || []).includes('elusive'));
	const st = fresh();
	const f = put(st, 0, c);
	ok('starts at 1 Attack', f.attack === 1, f.attack);
	fireOngoing(st, 0, 'creature-played', { minion: E.instantiate(byId._bear, 0) });
	ok('playing another creature -> +1 Attack (1->2)', f.attack === 2, f.attack);
}

// ---- 3) Spell Snare: counter a spell with mana value 2 or less ----
{
	const c = byId.spell_snare;
	ok('description "Counter target spell with mana value 2 or less."', c.description === 'Counter target spell with mana value 2 or less.', c.description);
	ok('counterSpell with manaValueMax:2 (not exact manaValue)',
		c.counterSpell === true && c.counter && c.counter.manaValueMax === 2 && c.counter.manaValue == null, JSON.stringify(c.counter));
	const sc = () => new Scenario(byId)
		.def('s_mv1', { type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] })
		.def('s_mv2', { type: 'sorcery', cost: 2, effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] })
		.def('s_mv3', { type: 'sorcery', cost: 3, effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] })
		.mana(0, 10).mana(1, 10);
	// MV 2 -> counterable, and countered
	{
		const r = sc().hand(0, ['s_mv2']).hand(1, ['spell_snare'])
			.play(0, 's_mv2')
			.expect('Spell Snare offered against MV2', st => E.counterOptions(st, 1).some(x => x.id === 'spell_snare'))
			.respond(1, 'spell_snare')
			.expectLife(1, E.STARTING_LIFE)
			.expect('MV2 spell countered to graveyard', st => st.players[0].graveyard.some(x => x.id === 's_mv2'))
			.run();
		ok('MV2 spell is counterable and gets countered', r.failures.length === 0, r.failures);
	}
	// MV 1 -> also counterable (<= 2)
	{
		const r = sc().hand(0, ['s_mv1']).hand(1, ['spell_snare'])
			.play(0, 's_mv1')
			.expect('Spell Snare offered against MV1', st => E.counterOptions(st, 1).some(x => x.id === 'spell_snare'))
			.run();
		ok('MV1 spell is counterable (<= 2)', r.failures.length === 0, r.failures);
	}
	// MV 3 -> NOT counterable: no window opens, the spell resolves
	{
		const r = sc().hand(0, ['s_mv3']).hand(1, ['spell_snare'])
			.play(0, 's_mv3')
			.expect('no counter window opens for MV3', st => st.priority == null && st.stack.length === 0)
			.expectLife(1, E.STARTING_LIFE - 3)
			.run();
		ok('MV3 spell is NOT counterable (> 2) and resolves', r.failures.length === 0, r.failures);
	}
}

// ---- 4) Vapor Snag: bounce enemy creature + its controller loses 1 Life ----
{
	const c = byId.vapor_snag;
	ok('description "...\\nIts controller loses 1 Life."', c.description === 'Bounce target enemy creature.\nIts controller loses 1 Life.', c.description);
	ok('effects = bounce enemy-creature + 1 damage to enemy hero',
		c.effects[0].type === 'bounce' && c.effects[0].target === 'enemy-creature' && c.effects[1].type === 'damage' && c.effects[1].value === 1 && c.effects[1].target === 'enemy-heroes', JSON.stringify(c.effects));
	const st = fresh();
	const bear = put(st, 1, byId._bear);
	st.players[1].life = 40;
	E.execEffects(st, 0, c.effects, { type: 'creature', uid: bear.uid }, null);
	ok('enemy creature bounced off the board', !st.players[1].board.some(x => x.uid === bear.uid), st.players[1].board.length);
	ok('bounced creature returns to enemy hand', st.players[1].hand.some(x => x.id === '_bear'), st.players[1].hand.map(x => x.id).join(','));
	ok('its controller loses 1 Life (40 -> 39)', st.players[1].life === 39, st.players[1].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
