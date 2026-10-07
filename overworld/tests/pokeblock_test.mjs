// pokeblock_test.mjs — POKeBLOCKS are pokeemerald's, not "feed a berry".
//
// Condition used to rise by feeding a BERRY straight to a mon at a counter menu
// (contest.js feed: flavor -> its category, smoothness/2 -> sheen). Emerald makes
// a POKeBLOCK in the BERRY BLENDER and feeds THAT from the POKeBLOCK CASE.
// pokeblock.js ports the rules; this checks them against the decomp by hand:
//   1. the 43 berries (src/berry.c) in ITEM_TO_BERRY order, flavors + smoothness
//   2. CalculatePokeblock: the cyclic subtraction, the negatives, the max-RPM
//      factor and its rounding, the feel (sum / n - n)
//   3. CalculatePokeblockColor: RED..OLIVE / GRAY / WHITE / GOLD / BLACK (same
//      berry twice, a black block's random 3 flavors of 2)
//   4. SetOpponentsBerryData: the NPC sets and the Blend Master's (Tamato-Nomel
//      when you bring one of his)
//   5. feeding (use_pokeblock.c): nature like/dislike +-10%, only in the gain's
//      direction; sheen += feel to 255; "It won't eat anymore…"; the texts
//   6. the case: 40 slots, first free slot, full
//   7. the feeders: 100 steps, 5 tiles, the nature they pull
//
//   node overworld/tests/pokeblock_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

// node has no localStorage: a tiny in-memory one for the case
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };

const PB = await import('../pokeblock.js').catch(e => { A(false, 'overworld/pokeblock.js loads', e.message); return null; });
let data = null;
try { data = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/pokeblock_data.json'), 'utf8')); } catch (e) { A(false, 'overworld/pokeblock_data.json exists (tools/gen_pokeblock_data.mjs)', e.message); }
if (!PB || !data) done();
PB.initPokeblockData(data);

// ===== 1. berries =====
{
	const b = data.berries;
	A(b.length === 43 && b[0].id === 'cheriberry' && b[42].id === 'enigmaberry', '1. 43 berries, CHERI first, ENIGMA last');
	A(JSON.stringify(b[0].flavors) === '[10,0,0,0,0]' && b[0].smoothness === 25, '1. CHERI: spicy 10, smoothness 25');
	A(PB.berryNum('spelonberry') === 31 && PB.berryNum('tamatoberry') === 26, '1. ITEM_TO_BERRY: SPELON 31, TAMATO 26');
	const spelon = b[30];
	A(JSON.stringify(spelon.flavors) === '[40,10,0,0,0]' && spelon.smoothness === 70, '1. SPELON: spicy 40, dry 10, smoothness 70', JSON.stringify(spelon));
}

// ===== 2./3. blending =====
const bb = id => PB.toBlenderBerry(id);
{
	// CHERI + ASPEAR (the NPC set for a CHERI) at 50.00 RPM:
	// sums [10,0,0,0,10] feel 50; minus-next: [10,0,0,-10,0] -> 1 negative ->
	// [9,0,0,0,0]; x(5000/333+100 = 115)/10 = 103 -> rem 3 -> 10; feel 50/2-2 = 23
	const blk = PB.calculatePokeblock([bb('cheriberry'), bb('aspearberry')], 5000);
	A(blk.color === PB.CLR.RED && blk.spicy === 10 && blk.dry + blk.sweet + blk.bitter + blk.sour === 0 && blk.feel === 23,
		'2. CHERI + ASPEAR @ 50 RPM -> RED POKeBLOCK, spicy 10, feel 23', JSON.stringify(blk));
	A(PB.madeText(blk) === 'RED POKeBLOCK was made!\nThe level is 10, and the feel is 23.', '2. "RED POKeBLOCK was made! The level is 10, and the feel is 23."', PB.madeText(blk));
	// rounding up: 9 x (16650/333=50, +100=150) = 1350/10 = 135 -> rem 5 -> 14
	const fast = PB.calculatePokeblock([bb('cheriberry'), bb('aspearberry')], 16650);
	A(fast.spicy === 14, '2. the RPM factor rounds half up (9 x 150% = 13.5 -> 14)', String(fast.spicy));
	// two flavors: SPELON (40,10) + PECHA (sweet 10) + RAWST (bitter 10), 3 players at 0 RPM:
	// sums [40,10,10,10,0] feel 70+25+25=120 -> minus-next [30,0,0,10,-40] -> 1 neg ->
	// [29,0,0,9,0] -> x100% -> [29,0,0,9,0] -> 2 flavors, spicy strongest -> PURPLE; feel 120/3-3 = 37
	const two = PB.calculatePokeblock([bb('spelonberry'), bb('pechaberry'), bb('rawstberry')], 0);
	A(two.color === PB.CLR.PURPLE && two.spicy === 29 && two.bitter === 9 && two.feel === 37, '2. SPELON + PECHA + RAWST -> PURPLE (spicy 29, bitter 9), feel 37', JSON.stringify(two));
	// GOLD: a flavor over 50 — SPELON + SPELON is a duplicate, so use SPELON + PAMTRE(dry 40, sweet 10)
	// sums [40,50,10,0,0] -> [ -10, 40, 10, 0, -40 ] -> 2 neg -> [0,38,8,0,0] -> x(33300/333=100 -> 200%) -> [0,76,16,0,0] -> GOLD
	const gold = PB.calculatePokeblock([bb('spelonberry'), bb('pamtreberry')], 33300);
	A(gold.color === PB.CLR.GOLD && gold.dry === 76 && gold.sweet === 16, '3. a flavor over 50 -> GOLD', JSON.stringify(gold));
	// GRAY: 3 flavors; WHITE: 4+
	const gray = PB.calculatePokeblock([bb('cheriberry'), bb('pechaberry'), bb('rawstberry'), bb('chestoberry')], 0);
	// sums [10,10,10,10,0] -> minus-next [0,0,0,10,-10]: only bitter survives (9) -> GREEN
	A(gray.color === PB.CLR.GREEN && gray.bitter === 9 && gray.feel === 21, '3. CHERI+PECHA+RAWST+CHESTO -> the minus-next quirk leaves only bitter: GREEN, feel 100/4-4 = 21', JSON.stringify(gray));
	A(PB.pokeblockColor([bb('cheriberry'), bb('chestoberry')], [5, 5, 5, 0, 0], 0) === PB.CLR.GRAY, '3. three flavors -> GRAY');
	A(PB.pokeblockColor([bb('cheriberry'), bb('chestoberry')], [5, 5, 5, 5, 0], 0) === PB.CLR.WHITE, '3. four flavors -> WHITE');
	A(PB.pokeblockColor([bb('cheriberry'), bb('chestoberry')], [5, 0, 0, 0, 0], 4) === PB.CLR.BLACK, '3. more than 3 negatives -> BLACK');
	// BLACK: the same berry twice; its flavors are one of the 10 random 3-of-5 sets of 2
	const black = PB.calculatePokeblock([bb('cheriberry'), bb('cheriberry')], 0, () => 2);
	A(black.color === PB.CLR.BLACK && JSON.stringify(PB.flavorsOf(black)) === '[2,2,0,0,2]', '3. two CHERIs -> BLACK, flavor set #2 = sour+dry+spicy at 2', JSON.stringify(black));
}

// ===== 4. the NPCs' berries =====
{
	A(JSON.stringify(PB.opponentBerries('cheriberry', 4, false)) === '["aspearberry","rawstberry","pechaberry"]', '4. CHERI -> the NPCs bring ASPEAR, RAWST, PECHA');
	A(JSON.stringify(PB.opponentBerries('oranberry', 3, false)) === '["chestoberry","rawstberry"]', '4. ORAN (#7 -> set 7%5+5 = 6) -> CHESTO, RAWST', JSON.stringify(PB.opponentBerries('oranberry', 3, false)));
	A(JSON.stringify(PB.opponentBerries('cheriberry', 2, true)) === '["spelonberry"]', '4. the BLEND MASTER answers a CHERI with a SPELON');
	A(JSON.stringify(PB.opponentBerries('spelonberry', 2, true)) === '["tamatoberry"]', '4. ... and a SPELON with a TAMATO (his berries minus 5)', JSON.stringify(PB.opponentBerries('spelonberry', 2, true)));
}

// ===== 5. feeding =====
{
	const red = { color: PB.CLR.RED, spicy: 10, dry: 0, sweet: 0, bitter: 0, sour: 0, feel: 23 };
	const mk = nature => ({ name: 'MON', nature, contest: { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 0 } });
	const adamant = mk('adamant'), modest = mk('modest'), hardy = mk('hardy'), none = mk(null);
	const ra = PB.feedPokeblock(adamant, red), rm = PB.feedPokeblock(modest, red), rh = PB.feedPokeblock(hardy, red), rn = PB.feedPokeblock(none, red);
	A(adamant.contest.cool === 11 && /happily ate/.test(ra.ate), '5. ADAMANT likes spicy: COOL 10 +10% = 11, "happily ate"', JSON.stringify([adamant.contest, ra.ate]));
	A(modest.contest.cool === 9 && /disdainfully ate/.test(rm.ate), '5. MODEST dislikes spicy: COOL 10 -10% = 9, "disdainfully ate"', JSON.stringify([modest.contest, rm.ate]));
	A(hardy.contest.cool === 10 && /^MON ate the/.test(rh.ate) && none.contest.cool === 10, '5. HARDY (and no nature) take it as is, "ate the"');
	A(adamant.contest.sheen === 23 && rh.lines[0] === 'Coolness was enhanced!', '5. sheen += feel; "Coolness was enhanced!"', JSON.stringify(rh.lines));
	// LONELY likes spicy, dislikes sour: a net-liked block boosts only the liked flavor
	const lonely = mk('lonely');
	PB.feedPokeblock(lonely, { color: PB.CLR.PURPLE, spicy: 20, dry: 0, sweet: 0, bitter: 0, sour: 10, feel: 5 });
	A(lonely.contest.cool === 22 && lonely.contest.tough === 10, '5. LONELY + spicy 20/sour 10: gain > 0 boosts only spicy (COOL 22, TOUGH 10 untouched)', JSON.stringify(lonely.contest));
	const full = mk('hardy'); full.contest.sheen = 250; full.contest.cool = 250;
	PB.feedPokeblock(full, red);
	A(full.contest.sheen === 255 && full.contest.cool === 255, '5. condition and sheen cap at 255');
	A(PB.feedPokeblock(full, red) === null && PB.sheenMaxed(full), "5. a full-sheen mon won't eat anymore");
	const zero = PB.feedPokeblock(mk('hardy'), { color: PB.CLR.BLACK, spicy: 0, dry: 0, sweet: 0, bitter: 0, sour: 0, feel: 0 });
	A(zero.lines[0] === 'Nothing changed!', '5. "Nothing changed!"');
}

// ===== 6. the case =====
{
	mem.clear();
	A(PB.firstFreeSlot() === 0 && PB.caseList().length === 0, '6. an empty case');
	const blk = { color: PB.CLR.BLUE, spicy: 0, dry: 5, sweet: 0, bitter: 0, sour: 0, feel: 3 };
	for (let i = 0; i < 40; i++) PB.addPokeblock(blk);
	A(PB.caseList().length === 40 && PB.firstFreeSlot() === -1, '6. 40 POKeBLOCKS fill the case');
	A(PB.addPokeblock(blk) === false, '6. a 41st has nowhere to go');
	PB.removePokeblock(7);
	A(PB.firstFreeSlot() === 7, '6. a tossed slot is the first free one');
	A(JSON.parse(mem.get(PB.CASE_KEY)).length === 40, '6. it saves in magepunk_pokeblocks_v1');
	const reset = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	A(/'magepunk_pokeblocks_v1'/.test(reset) && /'magepunk_blender_records_v1'/.test(reset), '6. the case + blender records join the save inventory (and its sync)');
}

// ===== 7. the feeders =====
{
	PB.resetFeeders();
	const sweet = { color: PB.CLR.PINK, spicy: 0, dry: 0, sweet: 10, bitter: 0, sour: 0, feel: 1 };
	PB.placeFeeder('MAP_SAFARI_ZONE_SOUTH', 10, 10, sweet);
	A(PB.feederAt('MAP_SAFARI_ZONE_SOUTH', 10, 10) === 0 && PB.feederInRange('MAP_SAFARI_ZONE_SOUTH', 13, 12), '7. a feeder reaches 5 tiles');
	A(!PB.feederInRange('MAP_SAFARI_ZONE_SOUTH', 14, 12), '7. ... and no further');
	let n = 0; const r = () => (n++ === 0 ? 0 : 1);   // 0 % 100 < 80, then every swap coin = 1
	const nat = PB.feederNature(PB.feederInRange('MAP_SAFARI_ZONE_SOUTH', 10, 10), r);
	A(nat && PB.pokeblockGain(nat, sweet) > 0, '7. the feeder pulls a nature that likes sweet', nat);
	A(PB.feederNature(sweet, () => 85) === null, '7. 20% of the time it does not');
	for (let i = 0; i < 99; i++) PB.feederStep();
	A(PB.feederAt('MAP_SAFARI_ZONE_SOUTH', 10, 10) === 0, '7. still there after 99 steps');
	PB.feederStep();
	A(PB.feederAt('MAP_SAFARI_ZONE_SOUTH', 10, 10) === -1, '7. gone on the 100th');
}
done();
