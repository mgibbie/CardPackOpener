// Thirty-sixth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Grizzled Outrider -> add "Alliance: Gain +1/+1"
//   Invigorate        -> also "each player gains 4 Life" (on top of +4/+4)
//   Axebane Stag      -> add "Battlecry: Destroy target opponent's weapon" (keeps Connect)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 85) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Grizzled Outrider: Alliance: Gain +1/+1 ----------
{
	const c = cardsById.grizzled_outrider;
	ok('reads "Trample.\\nAlliance: Gain +1/+1."', c.description === 'Trample.\nAlliance: Gain +1/+1.', JSON.stringify(c.description));
	ok('Alliance is a creature-played buff-self +1/+1', c.ongoing?.on === 'creature-played' && c.ongoing.effects[0].type === 'buff-self' && c.ongoing.effects[0].attack === 1 && c.ongoing.effects[0].health === 1, JSON.stringify(c.ongoing));
	const st = game();
	const g = put(st, 0, E.instantiate(c, 0)); // 5/5
	E.fireOngoing(st, 0, 'creature-played', { minion: E.instantiate({ id: 'o', name: 'O', type: 'creature', cost: 1, attack: 1, health: 1 }, 0) });
	ok('Alliance grew it +1/+1 when another creature was played (6/6)', g.attack === 6 && g.maxHealth === 6, [g.attack, g.maxHealth]);
}

// ---------- Invigorate: +4/+4 to a creature AND each player gains 4 Life ----------
{
	const c = cardsById.invigorate;
	ok('reads the +4/+4 and Life clause', c.description.endsWith('Target creature gets +4/+4 until end of turn. Each player gains 4 Life.'), JSON.stringify(c.description));
	ok('effects: temp-buff +4/+4 to a creature + heal 4 to all heroes', c.effects.some(e => e.type === 'temp-buff' && e.attack === 4 && e.health === 4) && c.effects.some(e => e.type === 'heal' && e.value === 4 && e.target === 'all-heroes'), JSON.stringify(c.effects));

	const st = game();
	const tgt = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0));
	st.players[0].life = 20; st.players[1].life = 20;
	const a0 = tgt.attack;
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: tgt.uid, player: 0 }, null, 0);
	ok('the target got +4 Attack', tgt.attack === a0 + 4, [a0, tgt.attack]);
	ok('the caster gained 4 Life (20 -> 24)', st.players[0].life === 24, st.players[0].life);
	ok('the opponent ALSO gained 4 Life (20 -> 24)', st.players[1].life === 24, st.players[1].life);
}

// ---------- Axebane Stag: Battlecry destroys the enemy weapon; Connect intact ----------
{
	const c = cardsById.axebane_stag;
	ok('reads "Trample.\\nBattlecry: Destroy target opponent\'s weapon.\\nConnect: Gain +2/+2."', c.description === "Trample.\nBattlecry: Destroy target opponent's weapon.\nConnect: Gain +2/+2.", JSON.stringify(c.description));
	ok('has Battlecry keyword + destroy-weapon effect', (c.keywords || []).includes('battlecry') && c.effects?.[0]?.type === 'destroy-weapon', JSON.stringify([c.keywords, c.effects]));
	ok('still carries the Connect trigger', c.ongoing?.on === 'self-hit-player', JSON.stringify(c.ongoing));

	const st = game();
	st.players[1].weapon = { id: 'axe', name: 'Axe', attack: 3, durability: 2, zone: 'weapon', keywords: [] };
	const stag = E.instantiate(c, 0); stag.zone = 'hand'; st.players[0].hand.push(stag); st.players[0].mana.cur = 10;
	E.playCard(st, 0, stag.uid, null, null, 0);
	ok('Battlecry destroyed the opponent\'s weapon', !st.players[1].weapon, st.players[1].weapon);

	// Connect still fires: the Stag on board, hitting the hero, grows +2/+2
	const onBoard = st.players[0].board.find(x => x.id === 'axebane_stag');
	onBoard.sick = false; const b = onBoard.attack, h = onBoard.maxHealth;
	E.attack(st, 0, onBoard.uid, { type: 'hero', player: 1 });
	ok('Connect still grew it +2/+2 on hitting the hero', onBoard.attack === b + 2 && onBoard.maxHealth === h + 2, [onBoard.attack, onBoard.maxHealth]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
