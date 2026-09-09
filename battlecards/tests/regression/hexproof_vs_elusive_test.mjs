// hexproof_vs_elusive_test.mjs (2026-09-08)
//
// Owner ruling: Elusive and Hexproof are now DISTINCT.
//   Elusive  = can't be targeted by spells/Hero Powers by ANYONE, incl. its controller.
//   Hexproof = your opponents can't target it; its controller still can.
// (Previously both were one keyword that behaved like Hexproof.)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 81) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, kws) => { const c = E.instantiate({ id: 'x', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, keywords: kws }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
// can player `viewer` legally target creature `c` with a single-creature-target spell?
const canTarget = (st, viewer, c) => { E.recomputeAuras(st); return E.legalTargets(st, viewer, { targets: 'creature' }).some(t => t.type === 'creature' && t.uid === c.uid); };

// ---------- a plain creature is targetable by both sides (control) ----------
{
	const st = game();
	const plain = put(st, 1, []);
	ok('plain creature: opponent CAN target it', canTarget(st, 0, plain) === true);
	ok('plain creature: controller CAN target it', canTarget(st, 1, plain) === true);
}

// ---------- Elusive: nobody can target it ----------
{
	const st = game();
	const eEnemy = put(st, 1, ['elusive']);
	ok('Elusive: opponent CANNOT target it', canTarget(st, 0, eEnemy) === false);
	ok('Elusive: even the controller CANNOT target it', canTarget(st, 1, eEnemy) === false);
	// and the same when it is on player 0's side
	const st2 = game();
	const eMine = put(st2, 0, ['elusive']);
	ok('Elusive (mine): I CANNOT target my own Elusive creature', canTarget(st2, 0, eMine) === false);
	ok('Elusive (mine): my opponent CANNOT target it either', canTarget(st2, 1, eMine) === false);
}

// ---------- Hexproof: opponents can't, controller can ----------
{
	const st = game();
	const hEnemy = put(st, 1, ['hexproof']);
	ok('Hexproof: opponent CANNOT target it', canTarget(st, 0, hEnemy) === false);
	ok('Hexproof: its controller CAN target it', canTarget(st, 1, hEnemy) === true);
	const st2 = game();
	const hMine = put(st2, 0, ['hexproof']);
	ok('Hexproof (mine): I CAN target my own Hexproof creature', canTarget(st2, 0, hMine) === true);
	ok('Hexproof (mine): my opponent CANNOT target it', canTarget(st2, 1, hMine) === false);
}

// ---------- the 16 migrated cards now carry `hexproof`, not `elusive` ----------
{
	const migrated = ['ethereal_escort', 'farscape_fiend', 'grandmaster_malchezaar', 'millicent_harbinger_of_victory', 'the_forgotten_one', 'mothwood_direcat', 'bassara_tower_archer', 'aven_fleetwing', 'benthic_giant', 'godsire', 'shorigo_eastern_wind', 'opal_drake', 'cirdan_the_shipwright'];
	const bad = migrated.filter(id => { const c = cardsById[id]; return !c || (c.keywords || []).includes('elusive') || !(c.keywords || []).includes('hexproof'); });
	ok('all own-keyword Hexproof cards use hexproof (not elusive)', bad.length === 0, bad);
	// equipment / battlecry that GRANT Hexproof now grant the hexproof keyword
	ok('Robe of Stars grants hexproof via equip', (cardsById.robe_of_stars.equip?.keywords || []).includes('hexproof'));
	ok('Vulshok Wand grants hexproof via equip', (cardsById.vulshok_wand.equip?.keywords || []).includes('hexproof'));
	ok('Luto grants hexproof via battlecry', (cardsById.luto_exalted_rebel.effects || []).some(e => e.type === 'grant' && e.keyword === 'hexproof'));
	// a card that still SAYS Elusive keeps the elusive keyword
	ok('Chardalyn Dragon (says Elusive) still uses elusive', (cardsById.chardalyn_dragon.keywords || []).includes('elusive') && !(cardsById.chardalyn_dragon.keywords || []).includes('hexproof'));
}

// ---------- end-to-end: opponent's damage spell can't pick a Hexproof/Elusive creature ----------
{
	const st = game();
	const hex = put(st, 1, ['hexproof']);
	const spec = E.targetSpec(st, 0, { id: 'zap', type: 'sorcery', effects: [{ type: 'damage', value: 3, target: 'creature' }] });
	const legal = E.legalTargets(st, 0, spec).some(t => t.uid === hex.uid);
	ok('a damage spell offers no illegal Hexproof enemy target', legal === false, legal);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
