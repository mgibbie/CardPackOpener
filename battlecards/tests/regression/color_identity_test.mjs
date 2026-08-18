// Color-identity land-slot system: a slot walks blank -> basic -> advanced, in place.
// Identity is the LIVE union of the boost-tap colors of ALL your current lands (read from
// boost taps, not the `colors` field). Upgrades must share a CURRENT color and stay within
// identity; sacrificing a land sheds it. Cost: 3 mana + each opponent gets The Coin.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._c = { id: '_c', name: 'C', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(7), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = ['_c', '_c', '_c', '_c', '_c']; p.board = []; p.lands = []; p.life = 30; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
};
const colsEq = (def, str) => [...E.landColors(def)].sort().join('') === [...new Set(str)].sort().join('');
const uidOf = (st, id) => st.players[0].lands.find(l => l.id === id).uid;

// ---------- landColors reads boost taps (incl. Abzan colors:[] -> WBG) ----------
ok('landColors: Forest = G', colsEq(byId.forest, 'G'));
ok('landColors: Gruul Guildgate = RG', colsEq(byId.gruul_guildgate, 'RG'));
ok('landColors: Abzan Citadel = WBG from boost taps', colsEq(byId.abzan_citadel, 'WBG'));
ok('Abzan Citadel colors field IS empty (colorless card, WBG identity)', !(byId.abzan_citadel.colors || []).length);

// ---------- blank slot: only a basic can be developed ----------
{ const st = game(); ok('buyLand accepts a basic', E.buyLand(st, 0, 'forest')); ok('...1 land now', st.players[0].lands.length === 1); }
{ const st = game(); ok('buyLand REJECTS an advanced land in a blank slot', !E.buyLand(st, 0, 'temple_of_nylea')); ok('...blank stays blank', st.players[0].lands.length === 0); }

// ---------- colorIdentity = union of ALL current lands' boost colors ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); E.buyLand(st, 0, 'island');
  const id = E.colorIdentity(st, 0);
  ok('identity = {G,U} from Forest + Island', id.has('G') && id.has('U') && id.size === 2, [...id]); }

// ---------- upgrade a basic -> mono advanced sharing its color, within identity ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); const u = uidOf(st, 'forest');
  const ups = E.availableUpgrades(st, 0, u);
  ok('Forest offers Temple of Nylea (mono-G)', ups.some(d => d.id === 'temple_of_nylea'));
  ok('Forest does NOT offer Temple of Heliod (no shared color)', !ups.some(d => d.id === 'temple_of_heliod'));
  ok('Forest does NOT offer Simic yet (U not in identity)', !ups.some(d => d.id === 'simic_guildgate'));
  const p1h = st.players[1].hand.length;
  ok('upgrade Forest -> Temple of Nylea', E.upgradeLand(st, 0, u, 'temple_of_nylea'));
  ok('slot upgraded IN PLACE (still 1 land, now the temple)', st.players[0].lands.length === 1 && st.players[0].lands[0].id === 'temple_of_nylea');
  ok('upgrade gave each opponent a Coin', st.players[1].hand.length === p1h + 1); }

// ---------- gate: cannot upgrade into colors outside identity ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); const u = uidOf(st, 'forest');
  ok('cannot upgrade Forest -> Abzan Citadel without W+B', !E.upgradeLand(st, 0, u, 'abzan_citadel'));
  ok('...slot unchanged', st.players[0].lands[0].id === 'forest'); }

// ---------- anchor = CURRENT colors: upgrade widens the slot, frees the other basic ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); E.buyLand(st, 0, 'mountain');
  const fUid = uidOf(st, 'forest'), mUid = uidOf(st, 'mountain');
  ok('Forest can upgrade -> Gruul (RG) now that R is in identity', E.availableUpgrades(st, 0, fUid).some(d => d.id === 'gruul_guildgate'));
  ok('upgrade Forest -> Gruul Guildgate', E.upgradeLand(st, 0, fUid, 'gruul_guildgate'));
  E.sacrificeLand(st, 0, mUid);
  const id = E.colorIdentity(st, 0);
  ok('after saccing Mountain, R survives (held by the RG land)', id.has('R') && id.has('G'), [...id]);
  ok('...sac freed the slot (1 land left)', st.players[0].lands.length === 1); }

// ---------- re-upgrade: advanced -> advanced once a new color arrives ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); E.upgradeLand(st, 0, uidOf(st, 'forest'), 'temple_of_nylea');
  ok('mono-G temple cannot become Simic yet (no U)', !E.availableUpgrades(st, 0, uidOf(st, 'temple_of_nylea')).some(d => d.id === 'simic_guildgate'));
  E.buyLand(st, 0, 'island');
  const tUid = uidOf(st, 'temple_of_nylea');
  ok('now Temple of Nylea (G) can RE-upgrade -> Simic (GU)', E.availableUpgrades(st, 0, tUid).some(d => d.id === 'simic_guildgate'));
  ok('re-upgrade -> Simic Guildgate', E.upgradeLand(st, 0, tUid, 'simic_guildgate'));
  ok('...slot is now Simic (GU)', !!st.players[0].lands.find(l => l.id === 'simic_guildgate')); }

// ---------- three-color: Abzan Citadel reachable once identity covers W+B+G ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); E.buyLand(st, 0, 'plains'); E.buyLand(st, 0, 'swamp');
  const id = E.colorIdentity(st, 0);
  ok('identity = W+B+G', id.has('W') && id.has('B') && id.has('G') && id.size === 3);
  const fUid = uidOf(st, 'forest');
  ok('Forest (shares G) can upgrade -> Abzan Citadel', E.availableUpgrades(st, 0, fUid).some(d => d.id === 'abzan_citadel'));
  ok('upgrade -> Abzan Citadel', E.upgradeLand(st, 0, fUid, 'abzan_citadel'));
  ok('...Abzan Citadel is in play', st.players[0].lands.some(l => l.id === 'abzan_citadel')); }

// ---------- sac sheds identity + draws a card ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); const u = uidOf(st, 'forest');
  const h = st.players[0].hand.length;
  ok('identity has G before sac', E.colorIdentity(st, 0).has('G'));
  ok('sacrifice draws a card', E.sacrificeLand(st, 0, u) && st.players[0].hand.length === h + 1);
  ok('identity now empty (shed G)', E.colorIdentity(st, 0).size === 0); }

// ---------- cost: an upgrade spends LAND_COST mana ----------
{ const st = game(); E.buyLand(st, 0, 'forest'); const u = uidOf(st, 'forest');
  const before = E.availableMana(st.players[0]);
  E.upgradeLand(st, 0, u, 'temple_of_nylea');
  ok('upgrade spent LAND_COST mana', E.availableMana(st.players[0]) === before - E.LAND_COST, `${before}->${E.availableMana(st.players[0])}`); }

// ---------- scarcity: each advanced land is globally unique ----------
{ const st = game();
  const foe = E.instantiate(byId.temple_of_rhonas, 1); foe.zone = 'land'; st.players[1].lands.push(foe); // opponent controls Temple of Rhonas
  E.buyLand(st, 0, 'forest'); const u = uidOf(st, 'forest');
  const ups = E.availableUpgrades(st, 0, u);
  ok('scarcity: an opponent-controlled Temple of Rhonas is NOT offered', !ups.some(d => d.id === 'temple_of_rhonas'));
  ok('scarcity: the other G temple (Nylea) is still offered', ups.some(d => d.id === 'temple_of_nylea'));
  ok('scarcity: upgradeLand into a taken land is rejected', !E.upgradeLand(st, 0, u, 'temple_of_rhonas'));
  st.players[1].lands = []; // opponent loses it
  ok('scarcity: once released it becomes available again', E.availableUpgrades(st, 0, u).some(d => d.id === 'temple_of_rhonas')); }

// scarcity is self-inclusive: you can't build a second copy of one you already hold
{ const st = game();
  const own = E.instantiate(byId.temple_of_nylea, 0); own.zone = 'land'; st.players[0].lands.push(own);
  E.buyLand(st, 0, 'forest'); const u = uidOf(st, 'forest');
  ok('scarcity: no 2nd Temple of Nylea while you already control one', !E.availableUpgrades(st, 0, u).some(d => d.id === 'temple_of_nylea')); }

// basics are exempt — many copies across players are fine
{ const st = game();
  const f0 = E.instantiate(byId.forest, 0); f0.zone = 'land'; st.players[0].lands.push(f0);
  const f1 = E.instantiate(byId.forest, 1); f1.zone = 'land'; st.players[1].lands.push(f1);
  ok('scarcity: basics are never "taken" (both players hold a Forest)', !E.takenAdvancedLands(st).has('forest')); }

console.log(`${pass}/${pass + fail} color-identity checks passed`);
process.exit(fail ? 1 : 0);
