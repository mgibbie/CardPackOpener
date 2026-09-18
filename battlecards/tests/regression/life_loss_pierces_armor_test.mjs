// Life loss vs. damage (owner request, 2026-09-18).
// "Losing life" is a special flavor of damage that carries Piercing: it skips
// hero ARMOR and hits Health directly, but is otherwise fully normal damage —
// it still counts as the hero taking damage (secrets / "took damage" triggers
// still fire). Implemented as a `pierce:true` flag on the damage effect, threaded
// to damageHero(..., pierce). ~115 "loses N Life" cards were flagged.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._grunt = { id: '_grunt', name: 'Grunt', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(919), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.armor = 0; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const armorLife = (st, pi) => [st.players[pi].armor, st.players[pi].life];

// ---- 1) pierce (life loss) skips armor; plain damage is soaked by armor ----
{
	const st = fresh();
	st.players[1].armor = 5; const life0 = st.players[1].life;
	E.execEffects(st, 0, [{ type: 'damage', target: 'enemy-heroes', value: 3, pierce: true }], null, null);
	ok('life loss ignores armor: armor stays 5, life -3', st.players[1].armor === 5 && st.players[1].life === life0 - 3, armorLife(st, 1));

	const st2 = fresh();
	st2.players[1].armor = 5; const l2 = st2.players[1].life;
	E.execEffects(st2, 0, [{ type: 'damage', target: 'enemy-heroes', value: 3 }], null, null);
	ok('plain damage is soaked by armor: armor 2, life unchanged', st2.players[1].armor === 2 && st2.players[1].life === l2, armorLife(st2, 1));
}

// ---- 2) life loss STILL counts as the hero taking damage ----
{
	const st = fresh();
	st.players[1].armor = 10; const life0 = st.players[1].life;
	E.execEffects(st, 0, [{ type: 'damage', target: 'enemy-heroes', value: 4, pierce: true }], null, null);
	ok('it is still damage: heroDamagedThisTurn set', st.players[1].heroDamagedThisTurn === true, st.players[1].heroDamagedThisTurn);
	ok('it is still damage: heroDamageTakenThisTurn === 4', st.players[1].heroDamageTakenThisTurn === 4, st.players[1].heroDamageTakenThisTurn);
	ok('and it pierced the 10 armor (life -4)', st.players[1].armor === 10 && st.players[1].life === life0 - 4, armorLife(st, 1));
}

// ---- 3) a real converted card: Mind Blast "Each other player loses 5 Life." ----
{
	const c = byId.mind_blast;
	ok('mind_blast damage effect is flagged pierce', c.effects.some(e => e.type === 'damage' && e.pierce === true), JSON.stringify(c.effects));
	const st = fresh();
	st.players[1].armor = 8; const life0 = st.players[1].life;
	E.execEffects(st, 0, c.effects, null, null);
	ok('Mind Blast pierces armor: armor 8, life -5', st.players[1].armor === 8 && st.players[1].life === life0 - 5, armorLife(st, 1));
}

// ---- 4) target-player path (Lava Spike "Target player loses 3 Life.") pierces ----
{
	const c = byId.lava_spike;
	ok('lava_spike target-player is flagged pierce', c.effects.some(e => e.type === 'target-player' && e.pierce === true), JSON.stringify(c.effects));
	const st = fresh(); // 1 opponent -> applies directly
	st.players[1].armor = 5; const life0 = st.players[1].life;
	E.execEffects(st, 0, c.effects, null, null);
	ok('Lava Spike pierces armor: armor 5, life -3', st.players[1].armor === 5 && st.players[1].life === life0 - 3, armorLife(st, 1));
}

// ---- 5) AoE "enemies": hero portion pierces, creatures take normal damage ----
{
	const st = fresh();
	st.players[1].armor = 5; const life0 = st.players[1].life;
	const grunt = E.instantiate(byId._grunt, 1); grunt.zone = 'board'; grunt.sick = false; st.players[1].board.push(grunt); E.recomputeAuras(st);
	E.execEffects(st, 0, [{ type: 'damage', target: 'enemies', value: 2, pierce: true }], null, null);
	ok('enemies: hero armor pierced (armor 5, life -2)', st.players[1].armor === 5 && st.players[1].life === life0 - 2, armorLife(st, 1));
	ok('enemies: creature took normal 2 damage', grunt.damage === 2, grunt.damage);
}

// ---- 6) coverage: ~115 lose-Life cards carry the pierce flag ----
{
	const LOSE = /\blose(s)? \d+ Life\b/i;
	let flagged = 0, missing = [];
	for (const c of raw.cards) {
		if (!LOSE.test(c.description || '')) continue;
		let has = false, heroDmg = false;
		(function rec(v) {
			if (!v || typeof v !== 'object') return;
			if (Array.isArray(v)) { v.forEach(rec); return; }
			if (v.type === 'damage' && ['enemy-hero', 'enemy-heroes', 'own-hero', 'all-heroes', 'enemies'].includes(v.target)) { heroDmg = true; if (v.pierce) has = true; }
			if (v.type === 'target-player' && v.action === 'damage') { heroDmg = true; if (v.pierce) has = true; }
			for (const k in v) if (typeof v[k] === 'object') rec(v[k]);
		})(c);
		if (heroDmg) { if (has) flagged++; else missing.push(c.id); }
	}
	ok('all lose-Life cards with a hero-damage effect are flagged (>=110)', flagged >= 110 && missing.length === 0, 'flagged=' + flagged + ' missing=' + missing.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
