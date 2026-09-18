// Owner inbox batch, 2026-09-18.
//   Eldrazi Monument (wastes_eldrazi_monument) -> is now an Artifact (a permanent;
//     its buff still fires on entry — artifacts run `effects` as permanent battlecries)
//   Alpine Tyrant (alpine_tyrant) -> grants Frigid, not Freeze (distinct keywords:
//     Freeze/freezer = skip your next attack; Frigid = freeze whatever survives combat with it)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(70), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Eldrazi Monument is an Artifact, and still buffs on entry ----
{
	const c = byId.wastes_eldrazi_monument;
	ok('type is artifact', c.type === 'artifact', c.type);
	ok('keeps its +1/+1 & Elusive buff effect', c.effects[0].type === 'buff' && c.effects[0].attack === 1 && c.effects[0].health === 1 && c.effects[0].grant === 'elusive' && c.effects[0].target === 'friendly-creatures', JSON.stringify(c.effects));
	ok('description unchanged', c.description === 'Give your creatures +1/+1 and Elusive.', c.description);
	// FIRE: playing it lands a permanent in the artifact zone AND buffs the team
	const st = fresh();
	const mine = put(st, 0, byId._v);
	const theirs = put(st, 1, byId._v);
	const card = E.instantiate(c, 0); card.zone = 'hand'; card.cost = 0; st.players[0].hand.push(card);
	E.playCard(st, 0, card.uid, null, null, 0);
	ok('it stays on the board as an artifact permanent', st.players[0].artifacts.some(a => a.id === 'wastes_eldrazi_monument'), st.players[0].artifacts.map(a => a.id).join(','));
	ok('it is NOT in the graveyard (no longer a one-shot sorcery)', !st.players[0].graveyard.some(g => g.id === 'wastes_eldrazi_monument'), st.players[0].graveyard.map(g => g.id).join(','));
	ok('your creature got +1/+1 (2/3 -> 3/4)', mine.attack === 3 && mine.maxHealth === 4, [mine.attack, mine.maxHealth].join('/'));
	ok('your creature gained Elusive', (mine.keywords || []).includes('elusive') || (mine.auraKeywords || []).includes('elusive'), JSON.stringify([mine.keywords, mine.auraKeywords]));
	ok('the enemy creature is untouched', theirs.attack === 2 && theirs.maxHealth === 3, [theirs.attack, theirs.maxHealth].join('/'));
}

// ---- 2) Alpine Tyrant grants Frigid (not Freeze) ----
{
	const c = byId.alpine_tyrant;
	ok('description says Frigid', c.description === 'Battlecry: Discover a Beast & give it Frigid.', c.description);
	ok('the discover grants frigid', c.effects[0].type === 'discover' && c.effects[0].grant === 'frigid' && c.effects[0].tribe === 'Beast', JSON.stringify(c.effects));
	ok('no longer grants the freezer keyword', c.effects[0].grant !== 'freezer', c.effects[0].grant);
	ok('frigid and freezer are genuinely different keywords', E.KW.FRIGID === 'frigid' && E.KW.FREEZER === 'freezer', [E.KW.FRIGID, E.KW.FREEZER].join('/'));
	// FIRE: the Battlecry queues a Beast Discover whose pick carries the grant
	const st = fresh();
	const card = E.instantiate(c, 0); card.zone = 'hand'; card.cost = 0; st.players[0].hand.push(card);
	E.playCard(st, 0, card.uid, null, null, 0);
	const pend = st.pickQueue[0];
	ok('a Discover was queued for you', pend && pend.player === 0 && pend.ids.length > 0, JSON.stringify(pend && { p: pend.player, n: pend.ids.length }));
	ok('the queued pick carries grant: frigid', pend && pend.grant === 'frigid', pend && pend.grant);
	ok('every option is a Beast', pend && pend.ids.every(id => (byId[id].tribe || '').includes('Beast')), pend && pend.ids.map(i => byId[i].tribe).join('|'));
	// resolve it: the discovered card is in hand with Frigid granted
	E.resolvePick(st, pend.ids[0]);
	const got = st.players[0].hand.find(x => x.id === pend.ids[0]);
	ok('the discovered Beast is in hand with Frigid', got && (got.keywords || []).includes('frigid'), got && JSON.stringify(got.keywords));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
