// Mika's Mod Collection — where each card sits in the packed atlas (assets/2x/mikas.png).
// Shared by index.js (pos / soul_pos) and tools/micatro/pack_mikas_atlas.mjs (the packer),
// so the two can never disagree. The mod shipped one PNG per card (71x95 at 1x; Dagonet and
// Cicero are two cells wide: base + soul); the packer lays them out row by row, 10 per row.

/** The 60 jokers in the mod's own config order (MikasModCollection.lua lines 36-95): [config key, slug]. */
export const JOKERS = [
  ['primeTimeJoker', 'prime_time'], ['straightNateJoker', 'straight_nate'], ['fishermanJoker', 'fisherman'],
  ['impatientJoker', 'impatient'], ['cultistJoker', 'cultist'], ['sealCollectorJoker', 'seal_collector'],
  ['camperJoker', 'camper'], ['scratchCardJoker', 'scratch_card'], ['delayedJoker', 'delayed'],
  ['showoffJoker', 'showoff'], ['sniperJoker', 'sniper'], ['blackjackJoker', 'blackjack'],
  ['batmanJoker', 'batman'], ['bombJoker', 'bomb'], ['eyeChartJoker', 'eye_chart'],
  ['grudgefulJoker', 'grudgeful'], ['finishingBlowJoker', 'finishing_blow'], ['auroraBorealisJoker', 'aurora_borealis'],
  ['historicalJoker', 'historical'], ['suitAlleyJoker', 'suit_alley'], ['printerJoker', 'printer'],
  ['trainingWheelsJoker', 'training_wheels'], ['horseshoeJoker', 'horseshoe'], ['incompleteJoker', 'incomplete'],
  ['abbeyRoadJoker', 'abbey_road'], ['fishingLicenseJoker', 'fishing_license'], ['goldBarJoker', 'gold_bar'],
  ['riggedJoker', 'rigged'], ['commanderJoker', 'commander'], ['blueMoonJoker', 'blue_moon'],
  ['dagonetJoker', 'dagonet'], ['glueJoker', 'glue'], ['harpSealJoker', 'harp_seal'],
  ['footballCardJoker', 'football_card'], ['specialEditionJoker', 'special_edition'], ['stockpilerJoker', 'stockpiler'],
  ['studentLoansJoker', 'student_loans'], ['brokeJoker', 'broke'], ['goForBrokeJoker', 'go_for_broke'],
  ['streetFighterJoker', 'street_fighter'], ['checklistJoker', 'checklist'], ['oneOfUsJoker', 'one_of_us'],
  ['investorJoker', 'investor'], ['mountainClimberJoker', 'mountain_climber'], ['shacklesJoker', 'shackles'],
  ['buyOneGetOneJoker', 'buy_one_get_one'], ['packAPunchJoker', 'pack_a_punch'], ['sealStealJoker', 'seal_steal'],
  ['taxCollectorJoker', 'tax_collector'], ['glassCannonJoker', 'glass_cannon'], ['scoringTestJoker', 'scoring_test'],
  ['ciceroJoker', 'cicero'], ['dawnJoker', 'dawn'], ['savingsJoker', 'savings'],
  ['monopolistJoker', 'monopolist'], ['nebulaJoker', 'nebula'], ['cheapskateJoker', 'cheapskate'],
  ['psychicJoker', 'psychic'], ['cheatJoker', 'cheat'], ['plusOneJoker', 'plus_one'],
];
/** Jokers whose PNG is two cells wide (the soul layer sits right of the base). */
export const WIDE = new Set(['dagonet', 'cicero']);
/** The ported consumables (the 9 "In Development, do not enable" tarots are not part of the mod). */
export const CONSUMABLES = [
  ['aceOfPentaclesTarot', 'ace_of_pentacles'], ['pageOfPentaclesTarot', 'page_of_pentacles'], ['incenseSpectral', 'incense'],
];
/**
 * The decks borrow two vanilla deck backs (SMODS.Deck sprite = a cell of the base Enhancers atlas:
 * {5,2} and {6,0}); the packer copies those two cells in so the decks draw from this atlas.
 */
export const BACK_CELLS = [{ x: 5, y: 2 }, { x: 6, y: 0 }];
export const COLS = 10;

/** -> {jokers: {slug: {pos, soul_pos?}}, consumables: {slug: {pos}}, backs: [pos, pos], rows} */
export function layout() {
  let i = 0;
  const at = () => ({ x: i % COLS, y: Math.floor(i / COLS) });
  const out = { jokers: {}, consumables: {}, backs: [] };
  for (const [, slug] of JOKERS) {
    if (WIDE.has(slug) && i % COLS === COLS - 1) i++; // keep base + soul on one row
    const pos = at();
    i++;
    const e = { pos };
    if (WIDE.has(slug)) { e.soul_pos = at(); i++; }
    out.jokers[slug] = e;
  }
  for (const [, slug] of CONSUMABLES) { out.consumables[slug] = { pos: at() }; i++; }
  for (let b = 0; b < BACK_CELLS.length; b++) { out.backs.push(at()); i++; }
  out.rows = Math.ceil(i / COLS);
  return out;
}
