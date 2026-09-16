// Sixtieth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Whispersilk Cloak (wastes_whispersilk_cloak)   -> now Equipment: equipped creature +1 Attack & Elusive
//   Burnished Hart (wastes_burnished_hart)         -> tribe "Beast Construct Mech"
//   Phyrexian Metamorph (wastes_phyrexian_metamorph) -> "{T}: Adapt target creature."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(60), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id, atk = 2, hp = 3) => { const c = E.instantiate(id.startsWith('_') ? { id, name: 'Grunt', type: 'creature', cost: 1, attack: atk, health: hp } : cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Whispersilk Cloak: Equipment ----
{
	const w = cardsById.wastes_whispersilk_cloak;
	ok('Whispersilk Cloak is now an artifact', w.type === 'artifact', w.type);
	ok('it carries an equip payload (+1 Attack & Elusive, Equip 0)', w.equip && w.equip.attack === 1 && (w.equip.keywords || []).includes('elusive') && w.equip.cost === 0, JSON.stringify(w.equip));
	ok('it no longer has a spell effects list', !w.effects, JSON.stringify(w.effects));
	// FIRE it: play the equipment, attach to a creature, confirm the buff + keyword
	const st = fresh();
	const c = put(st, 0, '_g', 2, 3);
	const eq = E.instantiate(w, 0); eq.zone = 'hand'; st.players[0].hand.push(eq);
	E.playCard(st, 0, eq.uid, null, null);
	ok('the cloak enters as an artifact you can equip', st.players[0].artifacts.some(a => a.id === 'wastes_whispersilk_cloak'), st.players[0].artifacts.map(a => a.id).join(','));
	const art = st.players[0].artifacts.find(a => a.id === 'wastes_whispersilk_cloak');
	E.equip(st, 0, art.uid, c.uid);
	E.recomputeAuras(st);
	ok('the equipped creature gains +1 Attack', c.attack === 3, c.attack);
	ok('the equipped creature gains Elusive', (c.keywords || []).includes('elusive') || (c.auraKeywords || []).includes('elusive'), JSON.stringify([c.keywords, c.auraKeywords]));
}

// ---- 2) Burnished Hart: Beast Construct Mech ----
{
	const h = cardsById.wastes_burnished_hart;
	ok('Burnished Hart is a "Beast Construct Mech"', h.tribe === 'Beast Construct Mech', h.tribe);
	ok('keeps its mana-crystal Battlecry', (h.keywords || []).includes('battlecry') && (h.effects || []).length === 2);
	const st = fresh();
	const c = put(st, 0, 'wastes_burnished_hart');
	E.execEffects(st, 0, [{ type: 'buff', target: 'friendly-creatures', tribe: 'Mech', attack: 1, health: 1 }], null, null);
	ok('Mech-tribal buffs now hit it', c.attack === 2 && c.maxHealth === 2, [c.attack, c.maxHealth].join('/'));
	const st2 = fresh();
	const c2 = put(st2, 0, 'wastes_burnished_hart');
	E.execEffects(st2, 0, [{ type: 'buff', target: 'friendly-creatures', tribe: 'Beast', attack: 1, health: 0 }], null, null);
	ok('and Beast-tribal buffs too', c2.attack === 2, c2.attack);
}

// ---- 3) Phyrexian Metamorph: {T}: Adapt target creature ----
{
	const m = cardsById.wastes_phyrexian_metamorph;
	ok('Metamorph text reads "{T}: Adapt target creature."', m.description === '{T}: Adapt target creature.', m.description);
	ok('its tap ability is an adapt effect', m.tapAbility && m.tapAbility.effects[0].type === 'adapt', JSON.stringify(m.tapAbility));
	const st = fresh();
	const target = put(st, 0, '_t', 2, 3);
	const art = E.instantiate(m, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	E.recomputeAuras(st);
	ok('the artifact can be tapped', E.canTapArtifact(st, 0, art.uid), 'cannot tap');
	E.tapArtifact(st, 0, art.uid, { type: 'creature', uid: target.uid, player: 0 });
	const pend = st.pickQueue.find(p => p.mode === 'adapt');
	ok('tapping queues an Adapt pick with 3 options', pend && pend.ids.length === 3 && pend.adaptUids.includes(target.uid), JSON.stringify(pend && { ids: pend.ids, uids: pend.adaptUids }));
	if (pend) {
		const before = [target.attack, target.maxHealth, (target.keywords || []).length];
		E.resolvePick(st, pend.ids[0]);
		const after = [target.attack, target.maxHealth, (target.keywords || []).length];
		ok('resolving the Adapt upgrades the creature', after.join() !== before.join(), JSON.stringify({ before, after }));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
