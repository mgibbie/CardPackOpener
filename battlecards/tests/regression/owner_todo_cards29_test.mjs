// Twenty-ninth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Ferocious Zheng (location) -> renamed "Terraced Jungle Garden"
//   Cowl Prowler   (artifact)  -> renamed "Vermillion Vessel"
// Ids stay stable; only the display name changes. Mechanics must still fire.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 63) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- names ----------
ok('ferocious_zheng is now "Terraced Jungle Garden"', cardsById.ferocious_zheng.name === 'Terraced Jungle Garden', cardsById.ferocious_zheng.name);
ok('cowl_prowler is now "Vermillion Vessel"', cardsById.cowl_prowler.name === 'Vermillion Vessel', cardsById.cowl_prowler.name);
// ids unchanged (rename is display-only)
ok('ferocious_zheng id is unchanged', !!cardsById.ferocious_zheng && cardsById.ferocious_zheng.id === 'ferocious_zheng');
ok('cowl_prowler id is unchanged', !!cardsById.cowl_prowler && cardsById.cowl_prowler.id === 'cowl_prowler');

// ---------- mechanics still fire after the rename ----------
// Vermillion Vessel (artifact): {T} -> +1/+1 to a friendly creature
{
	const st = game();
	const vessel = E.instantiate(cardsById.cowl_prowler, 0); vessel.zone = 'artifact'; vessel.tapped = false; st.players[0].artifacts.push(vessel);
	const buddy = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0));
	E.recomputeAuras(st);
	E.tapArtifact(st, 0, vessel.uid, { type: 'creature', uid: buddy.uid, player: 0 });
	ok('Vermillion Vessel still taps for +1/+1', buddy.attack === 3 && buddy.maxHealth === 3, [buddy.attack, buddy.maxHealth]);
}

// Terraced Jungle Garden (location): tap -> 3/3 Trample Beast
{
	const st = game();
	const loc = put(st, 0, E.instantiate(cardsById.ferocious_zheng, 0));
	const before = st.players[0].board.filter(c => c.name === 'Beast').length;
	E.tapLand(st, 0, loc.uid, 0);
	const beast = st.players[0].board.find(c => c.name === 'Beast' && c.attack === 3 && c.maxHealth === 3);
	ok('Terraced Jungle Garden still taps for a 3/3 Beast', st.players[0].board.filter(c => c.name === 'Beast').length === before + 1 && !!beast, st.players[0].board.map(c => c.name));
	ok('the Beast has Trample', !!beast && (beast.keywords || []).includes('trample'), beast && beast.keywords);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
