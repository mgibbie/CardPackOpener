// sell_no_profit_test.mjs — BUYING A THING AND SELLING IT BACK NEVER MAKES STARS (Plans/INVENTORY_TRADE_SELL_PLAN.md
// item 16). The owner's rule (2026-11-25) is that a sale pays the FULL star value, so every price a game charges in
// stars must be at least what the thing then sells for. This file is where a new shop, or a changed value, is caught.
// What is checked: everything the site sells FOR STARS that the Inventory can sell back.
//   the Poketactica shop   a held item, an evolution item, polish, a kit: its price against its worth
//                          a starter figurine (200 stars): against what one sells for, counting the chance of a shiny
//   a Mystery Maze shop    an item's price on the carpet against its worth in the storage
//   a pack                 what Pocket charges against what a pack sells for
// What is NOT a purchase and is meant to pay: anything found, caught, recruited or won by playing.
// Pure: node only.   node overworld/tests/sell_no_profit_test.mjs
import { ptValue, figValue, starValue, SHINY_MULT, PT_STARS_PER_ITEM_LEVEL, PT_STARS_PER_GEM_LEVEL } from '../../site/values.js';
import { STARS_PER_PACK } from '../../site/stars.js';
import { HELD, EVO, CANDY, KIT, SHOP_FIG_STARS, goodStars } from '../../poketactica/js/goods.js';
import { STARTERS, STARTER_LEVEL } from '../../poketactica/js/figcol.js';
import { ITEMS as MM_ITEMS, priceOf } from '../../poketactica/js/mm/items.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };

// ---------- the Poketactica shop's goods
{
	const goods = [...Object.keys(HELD), ...Object.keys(EVO), ...Object.keys(CANDY), ...Object.keys(KIT)];
	const over = goods.filter((id) => ptValue({ k: 'item', id }) > Math.max(1, goodStars(id)));
	A(goods.length > 40 && over.length === 0, `none of the shop's ${goods.length} goods sells for more than it costs`, over);
	A(goods.every((id) => ptValue({ k: 'item', id }) >= 1), 'and each is worth a star at least');
	// (levels and gemstones are EARNED, in the Item World: they add worth, and that is play paying, not a purchase)
	A(PT_STARS_PER_ITEM_LEVEL > 0 && PT_STARS_PER_GEM_LEVEL > 0 && ptValue({ k: 'gem', gem: 'atk:7' }) + ptValue({ k: 'gem', gem: 'atk:3' }) === ptValue({ k: 'gem', gem: 'atk:10' }), 'a gemstone is worth its level: combining two makes no stars');
}

// ---------- a starter from the shop
{
	const SHINY_RATE = 1 / 512;   // (poketactica/js/figurine.js makeFigurine's own, which the shop uses)
	const worst = STARTERS.map((sp) => { const plain = figValue({ species: sp, level: STARTER_LEVEL }), shiny = figValue({ species: sp, level: STARTER_LEVEL, shiny: true }); return { sp, plain, mean: plain + (shiny - plain) * SHINY_RATE }; }).sort((a, b) => b.mean - a.mean)[0];
	A(STARTERS.length >= 12 && worst.plain <= SHOP_FIG_STARS, `a starter bought for ${SHOP_FIG_STARS} stars sells for no more (the dearest: ${worst.sp}, ${worst.plain})`, worst);
	A(worst.mean <= SHOP_FIG_STARS, 'even counting the chance that it is a shiny, buying starters to sell loses stars on average', worst);
	A(SHINY_MULT === 10, '(a shiny is worth ten times its species: if that changes, the line above is what to look at)');
}

// ---------- a Mystery Maze shop
{
	const sold = Object.keys(MM_ITEMS).filter((id) => id !== 'stars' && MM_ITEMS[id].group !== 'key');
	// (a stack on the carpet is priced by the piece, and is stored a piece at a time)
	const over = sold.filter((id) => { const worth = MM_ITEMS[id].group === 'good' ? ptValue({ k: 'item', id }) : ptValue({ k: 'store', id }); return worth > priceOf({ id, n: 1 }); });
	A(sold.length > 25 && over.length === 0, `none of the maze's ${sold.length} items sells for more than a shop there charges`, over);
	A(ptValue({ k: 'store', id: 'vaultkey' }) === null && ptValue({ k: 'store', id: 'stars' }) === null, 'a key and a pile of stars have no worth to sell');
}

// ---------- packs
{
	A(starValue({ kind: 'pk-pack', n: 1 }) <= STARS_PER_PACK && starValue({ kind: 'bc-pack', n: 1 }) <= STARS_PER_PACK && starValue({ kind: 'pk-booster', n: 1 }) <= STARS_PER_PACK, `a pack sells for no more than the ${STARS_PER_PACK} stars one costs`);
	// (cards are not sold for stars at all: server/sell.mjs refuses them, and inventory_sell_server_test.mjs checks that)
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
