import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 30, target: 'creature' }] };
function kill(s, pi, c) { c.shield = false; const k = give(s, pi, 't_kill'); E.playCard(s, pi, k.uid, { type: 'creature', uid: c.uid, player: c.controller }, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// 1. Piece death -> under construction + Launch Starship in hand (no duplicates)
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const p1 = summon(s, 0, 'dimensional_core'); kill(s, 0, p1);
  ok('piece joined construction', (s.players[0].starshipPieces || []).join() === 'dimensional_core');
  ok('launch spell conjured', s.players[0].hand.filter(c => c.id === 'gdb_launch_starship').length === 1);
  const p2 = summon(s, 0, 'arkonite_defense_crystal'); kill(s, 0, p2);
  ok('second piece joined, no duplicate spell', s.players[0].starshipPieces.length === 2
    && s.players[0].hand.filter(c => c.id === 'gdb_launch_starship').length === 1);
  // 2. Launch: combined stats/keywords/deathrattles
  const ls = s.players[0].hand.find(c => c.id === 'gdb_launch_starship');
  E.playCard(s, 0, ls.uid, null, null, 0);
  const ship = s.players[0].board.find(c => c.id === 'gdb_the_starship');
  ok('ship summoned', !!ship);
  ok('ship stats = 2+3 / 2+4', ship && ship.attack === 5 && ship.maxHealth === 6);
  ok('ship keywords: divine shield + taunt', ship && ship.keywords.includes('divine_shield') && ship.keywords.includes('taunt') && ship.shield === true);
  ok('pieces cleared + launch counted', s.players[0].starshipPieces.length === 0 && s.players[0].starshipsLaunched === 1);
  // 3. Ship deathrattle = arkonite's armor 4
  const armor0 = s.players[0].armor || 0;
  kill(s, 0, ship);
  ok('ship DR fired arkonite armor', (s.players[0].armor || 0) === armor0 + 4);
}
// 4. Launch effects fire (yamato cannon destroys a random enemy minion)
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false;
  const y = summon(s, 0, 'yamato_cannon'); kill(s, 0, y);
  const ls = s.players[0].hand.find(c => c.id === 'gdb_launch_starship');
  E.playCard(s, 0, ls.uid, null, null, 0);
  ok('yamato launch destroyed the enemy', !s.players[1].board.some(c => c.uid === foe.uid && c.damage < c.maxHealth));
  ok('ship got yamato stats 3/3', s.players[0].board.find(c => c.id === 'gdb_the_starship').attack === 3);
}
// 5. SCV discount
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const p1 = summon(s, 0, 'dimensional_core'); kill(s, 0, p1);
  const ls = s.players[0].hand.find(c => c.id === 'gdb_launch_starship');
  ok('launch costs 5 base', E.effectiveCost(s, 0, ls) === 5);
  const scv = give(s, 0, 'scv'); E.playCard(s, 0, scv.uid, null, null, 0);
  ok('scv: launch costs 3', E.effectiveCost(s, 0, ls) === 3);
  E.playCard(s, 0, ls.uid, null, null, 0);
  ok('discount consumed', (s.players[0].nextLaunchDiscount || 0) === 0);
}
// 6. buildingStarship condition (Crystal Welder)
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const cwA = give(s, 0, 'crystal_welder'); E.playCard(s, 0, cwA.uid, null, null, 0);
  ok('welder base 2/3 when not building', s.players[0].board.find(x => x.uid === cwA.uid).attack === 2);
  const p1 = summon(s, 0, 'dimensional_core'); kill(s, 0, p1);
  const cwB = give(s, 0, 'crystal_welder'); E.playCard(s, 0, cwB.uid, null, null, 0);
  ok('welder 4/5 while building', s.players[0].board.find(x => x.uid === cwB.uid).attack === 4);
}
// 7. The Exodar: free launch with Defense Protocol
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const p1 = summon(s, 0, 'biopod'); kill(s, 0, p1);
  const ex = give(s, 0, 'the_exodar'); E.playCard(s, 0, ex.uid, null, 1, 0); // choice 1 = Defense
  const ship = s.players[0].board.find(c => c.id === 'gdb_the_starship');
  ok('exodar launched the ship', !!ship);
  ok('defense protocol: taunt + shield', ship && ship.keywords.includes('taunt') && ship.shield === true);
}
// 8. Hand/deck transforms at launch (Hellion / Siege Tank / Thor)
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const hel = give(s, 0, 'hellion');
  s.players[0].deck = ['siege_tank'];
  const p1 = summon(s, 0, 'dimensional_core'); kill(s, 0, p1);
  const ls = s.players[0].hand.find(c => c.id === 'gdb_launch_starship');
  E.playCard(s, 0, ls.uid, null, null, 0);
  ok('hellion in hand became Hellbat', s.players[0].hand.some(c => c.id === 'sc_hellbat') && !s.players[0].hand.some(c => c.id === 'hellion'));
  ok('siege tank in deck became Deployed', s.players[0].deck.includes('sc_siege_tank_deployed'));
  // 9. Thor payload: repeat per launch
  s.players[1].life = 40; s.players[1].board = [];
  const th = give(s, 0, 'sc_thor_payload');
  E.playCard(s, 0, th.uid, { type: 'hero', player: 1 }, null, 0);
  ok('thor payload: 5 + 5 repeat (1 launch)', s.players[1].life === 30);
}
// 10. Lift Off: draws Terran + summons a 2/1 launchable piece
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const lo = give(s, 0, 'lift_off'); E.playCard(s, 0, lo.uid, null, null, 0);
  const tok = s.players[0].board.find(c => c.starshipPiece);
  ok('lift off summoned a 2/1 piece token', !!tok && tok.attack === 2 && tok.maxHealth === 1 && tok.token);
  // that token dying joins the ship; launching fires its launch effect
  kill(s, 0, tok);
  ok('token joined construction', (s.players[0].starshipPieces || []).length === 1);
}
// 11. Scrounging Shipwright: conjured card is a real piece
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const sw = give(s, 0, 'scrounging_shipwright'); E.playCard(s, 0, sw.uid, null, null, 0);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  ok('shipwright conjured a Starship Piece', !!got && byId[got.id] && byId[got.id].starshipPiece === true);
}
// 12. Star Vulpera destroys an enemy piece
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  summon(s, 1, 'crypt_lord');
  const ep = summon(s, 1, 'dimensional_core'); ep.shield = false;
  const sv = give(s, 0, 'star_vulpera'); E.playCard(s, 0, sv.uid, null, null, 0);
  ok('vulpera destroyed the enemy piece only', !s.players[1].board.some(c => c.uid === ep.uid)
    && s.players[1].board.some(c => c.id === 'crypt_lord'));
}
// 13. Gravitational Displacer: launch summons a copy of the ship
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const gd = summon(s, 0, 'gravitational_displacer'); kill(s, 0, gd);
  const ls = s.players[0].hand.find(c => c.id === 'gdb_launch_starship');
  E.playCard(s, 0, ls.uid, null, null, 0);
  const ships = s.players[0].board.filter(c => c.id === 'gdb_the_starship');
  ok('displacer: two ships', ships.length === 2);
  ok('copy matches stats', ships.length === 2 && ships[0].attack === ships[1].attack && ships[0].maxHealth === ships[1].maxHealth);
}
// 14. Ship inherits ongoing triggers (Felfused Battery: after this attacks, others +1 Attack)
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const fb = summon(s, 0, 'felfused_battery'); kill(s, 0, fb);
  const ls = s.players[0].hand.find(c => c.id === 'gdb_launch_starship');
  E.playCard(s, 0, ls.uid, null, null, 0);
  const ship = s.players[0].board.find(c => c.id === 'gdb_the_starship');
  ok('ship carries battery ongoing', !!ship && !!ship.ongoings && ship.ongoings.some(o => o.on === 'self-attacks'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
