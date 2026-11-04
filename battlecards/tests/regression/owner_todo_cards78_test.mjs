// Owner inbox batch, 2026-10-04.
//   Magitek Infantry       -> "Spellburst: Discover a 2-Cost Spell & a 3-Cost Spell."
//   Gongaga, Reactor Town  -> "⟳ ⟳: Target creature gains +2/+2." (a location's double tap)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
byId._spark = { id: '_spark', name: 'Spark', type: 'sorcery', cost: 1, rarity: 'common', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 78) {
	const st = E.createGame(byId, seededRng(seed), null, 2, [{ id: 'warrior', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const isSpell = d => d && ['sorcery', 'instant', 'spell'].includes(d.type);

// ---- 1) Magitek Infantry ----
{
	const c = byId.ff_cloud_4;
	ok('Infantry text', c.description === 'Spellburst: Discover a 2-Cost Spell & a 3-Cost Spell.', c.description);
	for (const seed of [1, 2, 3]) {
		const st = fresh(seed);
		put(st, 0, c);
		const sp = give(st, 0, byId._spark);
		E.playCard(st, 0, sp.uid, null, null, 0);
		const q = (st.pickQueue || []).filter(x => x.player === 0 && x.discover);
		const costs = q.map(x => (x.ids || []).map(o => byId[o.id || o]).filter(Boolean));
		ok(`[${seed}] casting a spell queues TWO Discovers`, q.length === 2, q.length);
		ok(`[${seed}] ...the first offers only 2-Cost spells`, costs[0] && costs[0].length && costs[0].every(d => isSpell(d) && d.cost === 2), JSON.stringify(costs[0] && costs[0].map(d => [d.name, d.type, d.cost])));
		ok(`[${seed}] ...the second offers only 3-Cost spells`, costs[1] && costs[1].length && costs[1].every(d => isSpell(d) && d.cost === 3), JSON.stringify(costs[1] && costs[1].map(d => [d.name, d.type, d.cost])));
		// Spellburst fires once
		st.pickQueue = [];
		const sp2 = give(st, 0, byId._spark);
		E.playCard(st, 0, sp2.uid, null, null, 0);
		ok(`[${seed}] Spellburst fires only once`, !(st.pickQueue || []).some(x => x.player === 0 && x.discover), JSON.stringify(st.pickQueue));
	}
}

// ---- 2) Gongaga, Reactor Town ----
{
	const c = byId.ff_cloud_7;
	ok('Gongaga text', c.description === '⟳ ⟳: Target creature gains +2/+2.', c.description);
	ok('Gongaga is still a location', c.type === 'location');
	for (const side of [0, 1]) {
		const st = fresh();
		const loc = put(st, 0, c);
		const t = put(st, side, byId._ogre);
		const r = E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: t.uid, player: side });
		ok(`taps onto ${side ? 'an ENEMY' : 'your'} creature for +2/+2 (any creature is a legal target)`, r !== false && t.attack === 3 && t.maxHealth === 11, `${t.attack}/${t.maxHealth}`);
		ok(`...and the location itself gains nothing (side ${side})`, (loc.attack || 0) === 0);
	}
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
