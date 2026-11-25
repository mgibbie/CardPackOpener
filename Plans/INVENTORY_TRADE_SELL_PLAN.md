# Inventory: everything tradeable, everything sellable

Owner, 2026-11-25: "Too many things say not tradeable. The only thing that shouldn't be tradeable is the overworld key
items; everything else you can trade or sell for stars. Selling should work like jokers in Micatro: the sell ribbon can
appear when selected."

## The owner's answers (2026-11-25)
| Question | Answer |
|---|---|
| What a sale pays | **Full star value** (the number on the tile) |
| Does selling ask first | **Always** |
| A held item a figurine is wearing, a gemstone set in an item | **Take it off first**; the tile says who wears it |
| Overworld Pokémon, bag, money | **Everything needs to live on the account** |
| Not signed in | **The Inventory needs sign-in**; nothing is "on this device" any more |
| Things with no star value today | **Valued from their in-game price**; every new value listed for the owner to check |
| Battlecards and Pocket cards | **Tradeable, not sellable**: they turn into dust in their own game, as now |

## What is wrong today
- **Poketactica goods say "not tradeable"**: held items, plush gemstones, evolution items, polish and kits, and the
  Mystery Maze storage. Only figurines trade.
- **Overworld things are "on this device"**: the page reads the browser's save, so a phone and a computer show
  different Pokémon, and a trade has to be collected in the game on the same device.
- **Nothing can be sold.** The only way to turn a thing into stars is to find someone to trade with.
- **A guest sees a half page** of device things that cannot be traded.

## The rule after this plan
One sentence the page, the server and the tests all follow: **everything you own is on your account, can be traded,
and can be sold for its star value, except overworld key and story items (neither) and cards (traded, dusted, not
sold).**

## Stage 1: Poketactica goods trade (S to M)
| # | What | Notes |
|---|---|---|
| 1 | A star value for every Poketactica good | Held items: their shop price, more with levels and gemstones (the same rule a figurine's value uses). Evolution items, polish, kits, maze storage items: their in-game price. Gemstones: by level. |
| 2 | Goods in the trade window | A "Poketactica" tab beside Figurines; the server moves them between collections whole (an item keeps its level and its gemstones). |
| 3 | Worn things | A tile for something a figurine wears reads "on Croconaw: take it off to trade or sell" and is not offered. |
| 4 | The "not tradeable" label goes | It stays only on overworld key and story items. |

## Stage 2: the sell ribbon (M)
| # | What | Notes |
|---|---|---|
| 5 | Select a tile, a ribbon appears on it | Micatro's joker ribbon: "SELL 165 ★". Keyboard, controller and touch: select with Z / A / a tap, the ribbon is the focused button. |
| 6 | Always a confirm | "Sell Croconaw Lv 29 for 269 ★?" with what will be lost named (its moves' levels, what it holds if anything). |
| 7 | A stack sells one or all | "Sell 1" and "Sell all 12" on a stack; currencies (dust, gold, coins, tickets) take a number. |
| 8 | The server does the sale | One action, guarded on the row as read, that removes the thing and adds the stars in the same step. Never trusts a price from the page. |
| 9 | A sale can be undone for a short while | The last sale is kept for 10 minutes with a "Take it back" button at the same price. A mis-press on a figurine is otherwise for ever. |

## Stage 3: the overworld on the account (L)
The biggest piece, and the one with a save migration in it.
| # | What | Notes |
|---|---|---|
| 10 | The Inventory reads the account's overworld save | The server already holds it (`ow:<user>`). The page stops reading the browser's copy. |
| 11 | Trades and sales of overworld things happen on the server's copy | Guarded on the save's revision: if the game is open and has moved on, the action is refused and says "close the overworld, or save, and try again". No more "collect it in the game on this device". |
| 12 | The game picks the change up | On its next sync the game sees a newer revision from the Inventory and takes it, as it does for a repair today. |
| 13 | Sign-in only | Not signed in: the page asks you to sign in. The device-only sections go. |

**The owner's standing rule applies here**: no save is changed without a backup and a way back. Each account's save is
copied before the first Inventory write, the write goes through the same guarded import a repair uses, and stage 3
ships behind a switch that can be turned off without a deploy.

## Stage 4: values and safety (S to M, alongside the others)
| # | What | Notes |
|---|---|---|
| 14 | Every new star value in one table in this plan | For the owner to check before stage 2 ships. |
| 15 | A test that nothing is stuck | For every kind of thing the Inventory can show: it has a value, or it is a key item, or it is a card. A new kind of thing without one fails the test. |
| 16 | A test that buying and selling never makes stars | For everything a game sells for stars: its price is at least what it sells back for. See below. |

## What "full value" opens, said plainly
Selling at full value means the star value on a tile is real money in the site's one currency.
- **Buy and resell.** Anything a game sells for less than its star value would mint stars. Item 16 is the test that
  finds every such case; each is fixed by raising the buy price or lowering the value, the owner's choice per case.
- **Free things become stars.** A caught Pokémon, a recruited figurine, a Mystery Maze find and a pack from a reward
  all cost nothing and will sell for their value. That is a new source of stars for every player who plays. It may be
  exactly what is wanted (playing pays). If it turns out to be too much, the lever is the values themselves, in one
  file (`site/values.js`).
- **Stars are what spectator bets are made in**, so more stars in circulation means bigger pools.

## Not in this plan
- Selling cards for stars (the owner: dust only).
- A market between players (listing a thing at a price for anyone to buy). Trades stay person to person.
- Any change to what key and story items are.

## Order
Stage 1, then 2, then 4's table for the owner to check, then 3. Stage 1 and 2 need nothing from stage 3: the
overworld sections stay as they are until stage 3 moves them.

## How to tell it worked
- The words "not tradeable" appear only on overworld key and story items.
- Any other tile, selected, shows a sell ribbon; a confirmed sale adds exactly the tile's stars.
- A phone and a computer signed in to the same account show the same Inventory.
- The two tests in stage 4 pass, and fail when a thing is added without a value or priced under what it sells for.

## Built (2026-11-25): stage 1, Poketactica goods trade
- **Every Poketactica good has a star value and can be put in a trade**: held items (with their level and the
  gemstones set in them), evolution items, polish, kits, loose plush gemstones and Mystery Maze storage items. The
  trade window's "Figurines" tab is now "Poketactica" and lists them under the figurines, one by one.
- **"Not tradeable" is gone from the Poketactica section.** Each tile shows what its loose ones are worth. One a
  figurine wears is not offered; a tile with only worn ones says "take it off to trade".
- **They move whole.** A Lv 31 Charcoal Stick arrives Lv 31 with its gemstone still in it.
- **Nothing is dropped.** If the receiver has no room (the Mystery Maze storage holds 200), the trade is cancelled
  before anything is swapped and says why. A cancelled trade gives everything back.
- **The server decides what a thing is and what it is worth**, from the owner's own row; what a page claims is ignored.
- **Not done here**: goods cannot be staked in a spectator bet yet (figurines can). Selling is stage 2.

### The new star values, for the owner to check (stage 4, item 14)
| Thing | Worth | From |
|---|---|---|
| A held item, an evolution item, polish, a kit | Its shop price in stars | `poketactica/js/goods.js` (Leftover Clay 120, Rare Polish 25, Pull Cord 200, ...) |
| A held item above level 1 | + 10 stars a level | New number |
| A gemstone set in a held item | + that gemstone's worth | |
| A plush gemstone | 5 stars a level (Lv 20: 100) | New number. Linear, so two combined are worth what they were apart |
| A Mystery Maze storage item | Its price in the maze's shops (Oran Bead 30, Escape Marble 150) | `poketactica/js/mm/items.js` |
| A Brass Key, a pile of maze stars | Nothing (they never leave a dungeon) | |

The two new numbers (10 a level, 5 a gemstone level) are in `site/values.js`. A Lv 100 held item full of Lv 100
gemstones comes to its price + 990 + up to 8 x 500, about 5,000 stars.

## Built (2026-11-25): stage 2, the sell ribbon
- **Select a tile and a gold ribbon appears on it** with its full star value: "SELL · 269 ★". A stack shows
  "SELL 1" and "SELL ALL 12"; a currency chip shows "SELL…" and asks how many. Click, tap, Z, Enter or a
  controller's A all select; X or Escape lets go.
- **It always asks first**: what, for how much, and what goes with it (a figurine's move levels, an item's level and
  gemstones). "Keep" is the focused button.
- **What sells**: figurines, every Poketactica good, dust, gold, Battlecards and Pocket packs, MicaSurvivor coins and
  tickets. **Not**: cards (dust only), stars, and the overworld's things (until stage 3 puts them on the account).
- **"Sell 1" on a stack takes the least valuable one**, so a levelled item is never sold by a slip.
- **A figurine wearing an item has no ribbon**: "Take off its Leftover Clay first."
- **Take it back**: for ten minutes a bar at the top says what was sold and offers to take it back at the same
  price. Only the newest sale; not once the stars are spent.
- **The server decides the price** from the seller's own rows; a page's claims are ignored. A sale is the trade
  system's own guarded steps, written down first and carried on if a request dies, so nothing is lost or paid twice.
- **Not done**: item 16 (the test that nothing is bought for less than it sells for). Pack points still have no
  worth and no ribbon.
