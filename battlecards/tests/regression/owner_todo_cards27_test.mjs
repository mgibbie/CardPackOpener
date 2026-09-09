// Twenty-seventh batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Feral Krushok -> "Bash & Trample."
//   Cowl Prowler  -> {T}: Target creature gains +1/+1. (artifact tap ability)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 59) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana.max = 10; p.mana.cur = 10; } return st; };

// ---------- Feral Krushok: Bash & Trample ----------
{
	const c = cardsById.feral_krushok;
	ok('Feral Krushok reads "Bash & Trample."', c.description === 'Bash & Trample.', JSON.stringify(c.description));
	ok('keywords are [bash, trample]', ['bash', 'trample'].every(k => c.keywords.includes(k)), JSON.stringify(c.keywords));
	ok('instance carries both', E.instantiate(c, 0).keywords.includes('bash') && E.instantiate(c, 0).keywords.includes('trample'));
}

// ---------- Cowl Prowler: {T}: Target creature gains +1/+1 ----------
{
	const c = cardsById.cowl_prowler;
	ok('Cowl Prowler reads "{T}: Target creature gains +1/+1."', c.description === '{T}: Target creature gains +1/+1.', JSON.stringify(c.description));
	ok('tap ability buffs a friendly creature +1/+1', c.tapAbility?.effects?.[0]?.type === 'buff' && c.tapAbility.effects[0].attack === 1 && c.tapAbility.effects[0].health === 1 && c.tapAbility.effects[0].target === 'friendly-creature', JSON.stringify(c.tapAbility));

	// FIRE it: tap the artifact targeting a friendly creature -> +1/+1
	const st = game();
	const cowl = E.instantiate(c, 0); cowl.zone = 'artifact'; cowl.tapped = false; st.players[0].artifacts.push(cowl);
	const buddy = E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0); buddy.zone = 'board'; buddy.sick = false; st.players[0].board.push(buddy);
	E.recomputeAuras(st);
	const used = E.tapArtifact(st, 0, cowl.uid, { type: 'creature', uid: buddy.uid, player: 0 });
	ok('the tap succeeded', used === true, used);
	ok('the target creature got +1/+1 (2/2 -> 3/3)', buddy.attack === 3 && buddy.maxHealth === 3, [buddy.attack, buddy.maxHealth]);
	ok('the artifact is now tapped', cowl.tapped === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
