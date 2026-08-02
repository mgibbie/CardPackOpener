// The AI uses {T} artifact abilities: given Detective's Satchel and Clues, the
// enemy AI should sacrifice a Clue and then tap the satchel to make a Mech.
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const AIP = 1;
const st = E.createGame(cardsById, seededRng(11), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
st.current = AIP;
// small filler deck so the Clue's draw doesn't fatigue-spam
st.players[AIP].deck = ['wisp', 'wisp', 'wisp'].map(id => { const c = E.instantiate({ id, name: 'Wisp', type: 'creature', cost: 0, rarity: 'basic', attack: 1, health: 1 }, AIP); c.zone = 'deck'; return c; });
st.players[AIP].mana.max = 10; st.players[AIP].mana.cur = 10;

// the AI plays the satchel (Investigate twice -> two Clues)
const art = E.instantiate(cardsById['detectives_satchel'], AIP); art.zone = 'hand'; st.players[AIP].hand.push(art);
E.playCard(st, AIP, art.uid, null, null, 0);
const satchel = st.players[AIP].artifacts.find(a => a.id === 'detectives_satchel');
ok('setup: AI has the satchel + two Clues', satchel && st.players[AIP].artifacts.filter(a => a.id === 'clue_token').length === 2);

const mechs = () => st.players[AIP].board.filter(c => (c.tribe || '').includes('Mech'));
ok('no Mech before the AI acts', mechs().length === 0);

// drive the AI: each step() does one action; loop until it makes a Mech or stops
let sawSac = false, madeMech = false;
for (let i = 0; i < 60; i++) {
	const cluesBefore = st.players[AIP].artifacts.filter(a => a.id === 'clue_token').length;
	const acted = AI.step(st, AIP);
	if (st.players[AIP].artifacts.filter(a => a.id === 'clue_token').length < cluesBefore) sawSac = true;
	if (mechs().length > 0) { madeMech = true; break; }
	if (!acted) break;
	if (st.over) break;
}

ok('the AI sacrificed a Clue', sawSac);
ok('the AI tapped the satchel to create a 1/1 Mech with Taunt', madeMech && mechs()[0].attack === 1 && E.hp(mechs()[0]) === 1 && mechs()[0].keywords.includes('taunt'), mechs().map(m => [m.attack, E.hp(m), m.keywords]));
ok('the satchel is now tapped (used once)', satchel.tapped === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
