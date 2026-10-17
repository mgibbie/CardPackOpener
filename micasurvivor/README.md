# MicaSurvivor

MicaSurvivor is **PokéSurvivor by JPTER78** (https://github.com/JPTER78/pokesurvivor), a browser
bullet-heaven roguelike with Pokémon Mystery Dungeon sprites, ported into the Magepunk site
(`Plans/MICASURVIVOR_PLAN.md`). Phase M1 is the game as-is, offline. Phase M2 adds controller
support (see "Controller" below). Phase M3 brings it into Magepunk: the landing tile, the Pewter
Museum arcade cabinet, Magepunk accounts and the leaderboard (see "Magepunk (M3)" below).

Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)

## Licences

- **Code**: PolyForm Noncommercial License 1.0.0 (`LICENSE-NONCOMMERCIAL.md`). Code from before
  commit b297089 (14-10-2026) is MIT (`LICENSE`). Vendored from upstream HEAD
  `5bbc3b29288d6af4596f21188fb8b54e0e9b739f` (2026-10-15).
  **MicaSurvivor must never get ads, paid items or anything sold.**
- **Sprites**: PMDCollab SpriteCollab, CC BY-NC 4.0. Every artist is listed in `CREDITS.md`, and
  the in-game Credits screen (title screen → "Credits & licences", or Settings → About) shows them.
- **Font**: Pixelify Sans, SIL OFL (`fonts/OFL.txt`).
- **Controller design** (M2): taken from the Android port by JayElDragon (MIT),
  https://github.com/JayElDragon/poke-survivor.
- **Mechanics** (M5): ported from the same Android port by JayElDragon (MIT); see "Mechanics from
  the Android port".
- Pokémon © Nintendo / Creatures Inc. / GAME FREAK. This is a non-commercial fan project.

## How it loads

There is **no build step**. `index.html` is upstream's `dev.html` (the source page) and loads each
classic script under `js/` in order with `<script defer>`. Every module hangs off the global `G`,
so `window.G` can be reached from the console and from tests. Upstream's `tools/build.js`
(terser + javascript-obfuscator into `app.min.js`) is deliberately not used: the obfuscated
bundle is unreadable, and it is the only thing their updater needs. All paths are relative, so
the page works from `/micasurvivor/`.

## Assets (not in git)

`assets/pokemon/<dex>/` (13,481 files, ~104 MB) is **gitignored**. On the live site
`_redirects` sends `/micasurvivor/assets/*` with a 301 to `https://magepunk-micasurvivor.pages.dev/`,
which is a separate Pages project. Sheets load with `crossOrigin = 'anonymous'`, and the staged
`_headers` adds `Access-Control-Allow-Origin: *`.

- Local copy: `cp -r <pokesurvivor checkout>/assets/pokemon micasurvivor/assets/`
- Deploy (owner): `npm run deploy-micasurvivor`. This runs `tools/micasurvivor/stage_assets.mjs`,
  which copies `micasurvivor/assets` into `.micasurvivor/` and writes `_headers`, then deploys
  from inside `.micasurvivor` so the site's functions aren't bundled.
- The small essentials are tracked in git: `fonts/` (Pixelify, ~100 KB), `icons/`, `favicon.ico`.

## Saves

Every localStorage key starts with `micasurvivor_` (upstream used `ps.`). A guest's save is
`micasurvivor_save.guest` and stays in the browser (a guest makes no network request at all). A
player logged into Magepunk saves to their account (see "Magepunk (M3)").

## Magepunk (M3)

- **Landing tile**: `index.html` (art: `icons/tile.png`, a sprite composite drawn by
  `tools/micasurvivor/make_art.mjs` from the game's own SpriteCollab sheets), with the "Based on
  PokéSurvivor by JPTER78" credit. Also in `sitemap.xml`.
- **Arcade cabinet**: the Pewter Museum 1F lobby, `overworld/arcade.js` (15,8), against the foot of
  the reception counter; played from (14,8). Sprite `overworld/fx/micasurvivorbox.png` (20x32, same
  script). Interacting saves party + position and opens `/micasurvivor/?direct=1`; with `?direct=1`
  the game's "Back to the overworld" links (login screen, menu) go to `/overworld/`, otherwise
  "Back to Magepunk" goes to `/`.
- **Accounts** (`js/mica/account.js` + the Magepunk mode in `js/core/db.js`): with the site's
  login in localStorage (`magepunk_mp_token_v1` + `magepunk_mp_state_v1`) the game skips the login
  screen and plays as that user (the user pill shows the username). The save is the server row
  `micasurvivor:<user>` (`POST /api/mp` `micasurvivor-save-get` / `micasurvivor-save-put`: logged
  in only, exact key from the token, 400 KB cap, 30 writes a minute), and this browser keeps a copy
  under `micasurvivor_save.mp:<user>` (cache and offline play) with the row's revision under
  `micasurvivor_rev.mp:<user>`. Writes are debounced (a purchase or pull ~3 s, a finished run ~2 s,
  anything else ~30 s) and flushed when the tab is hidden or closed.
- **Merge strategy**: every write is a compare-and-set on the row's `rev` (one atomic SQL
  statement). A device that has not seen the latest revision gets **409** with the stored save; it
  merges the two with upstream's own `merge()` and writes again on the new revision, so a second
  device never silently overwrites the first. `merge()` never loses progress: owned Pokémon,
  shinies, legendaries, arenas, items, evolved moves and achievements are unioned; upgrades, stats
  and records keep the max; Pokémonedas and tickets come from the per-device ledger (`save.led`,
  earned / spent per device, the max of each entry, the balance is the sum), so coins earned on two
  devices both count and a spend is never undone; the partner and other choices come from the most
  recently updated save. On boot the server copy and the local copy are merged the same way. Back in
  a tab after 5+ minutes, the menu pulls and merges what another device saved.
- **Guest -> account**: a guest save in this browser is offered to the account **once**
  (`#scr-carry`). An empty account takes it over (its own starting ledger entries zeroed, so no
  extra 500 coins appear later); an account with progress is merged with it (the guest ledger
  re-keyed `g.<device>` so both balances add up; the account's own choices win). The account save
  is backed up first to `micasurvivor_backup.mp:<user>.<time>`; the guest save is never deleted; the
  answer is remembered in `micasurvivor_migrated.guest`.
- **Log out / Delete account** stay hidden: a Magepunk player's account belongs to the site
  (Settings -> Account shows "Magepunk account", the username, and a link to Magepunk instead).
  Upstream's "What's new" stays hidden too (it is PokéSurvivor's own changelog).
- **Leaderboard**: `run-score` mode `micasurvivor` on the site's run boards: a clean solo run of
  2+ minutes (upstream's `MIN_T`, and its anti-tamper `clean()`) sends `{time, kills, level, dex,
  shiny}`; the board ranks by survival time, then kills; a time past 4 hours is refused. The menu's
  Ranking item opens the board (top 50 + your rank) in place of upstream's Firebase boards. Friends
  and co-op still say "Coming soon".
- **Design wiki**: `#/micasurvivor` (overview, Pokémon, Moves, Items & Upgrades), data generated by
  `node tools/micasurvivor/gen_designwiki.mjs` into `designwiki/data/micasurvivor.json` — rerun it
  after changing `js/data`.
- **Magepunk News**: `tools/gen-magepunknews.mjs` announces the launch on the commit that first
  adds `js/mica/account.js` (entry kind `micasurvivor`).

## What changed from upstream

Every edit is marked `MicaSurvivor` in a comment:

- **Left out**: the SEO sub-sites (guia/, pokedex/, objetos/, legendarios/, novedades/, en/, apoyar/,
  contacto/, logros/, movimientos/, tipos/, shinies/, docs/), `js/core/firebase-config.js`,
  `js/core/updater.js` (forced-update reloads), `js/data/funding.js` and `js/ui/support-ui.js`
  (donations), `sw.js` and `manifest.webmanifest`, CNAME, firebase.json, Firestore and database rules,
  `version.json`, `dev.html`, `js/app.min.js`, `tools/`, GDD.md and `assets/og-image.jpg`.
- `js/core/db.js`: the Firebase cloud is stubbed (`initCloud` returns false, so the game never
  loads the SDK). The upstream body is kept, never called, to keep the diff small. "Play" is a
  **persistent** local guest profile, where upstream's guest save lived only in memory. (M3) A
  Magepunk mode: a logged-in player's save lives in their account (see "Magepunk (M3)").
- `index.html`: SEO/og/ld+json and preconnects are gone. The login screen has one **Play**
  button and a "Log in with Magepunk" button (upstream's password and Google login stay hidden:
  Magepunk accounts replace them). The
  Gmail-recovery and donation screens are gone. The legal screen is now **Credits & licences**,
  filled by `js/mica/credits.js`. The title says MicaSurvivor, with the "based on PokéSurvivor by
  JPTER78" credit on the boot screen, title screen, menu, footer and Settings → About.
- `js/core/i18n.js`: English by default. Español is still selectable in Settings → Graphics.
- `js/ui/social-ui.js`, `js/ui/menu.js`: Friends and co-op show "Coming soon" (they need the
  cloud). `js/ui/ranking-ui.js`: the Ranking opens the Magepunk leaderboard (M3).
- `js/net/net.js`: no STUN servers, so the game makes no external request even if co-op code runs.
- `js/main.js`, `js/game.js`: no service worker, no SupportUI or Updater.
- `js/core/sprites.js`: `crossOrigin = 'anonymous'` on sprite sheets.
- Every storage key went from `ps.` to `micasurvivor_`. All text files were normalised to LF.

## Controller (M2)

`js/core/pad.js` (`G.Pad`) adds controller play. The design comes from the Godot Android port
by **JayElDragon** (MIT, https://github.com/JayElDragon/poke-survivor: `scripts/pad.gd`,
`padicons.gd`, and the menu / pause / card-choice handling). It is rebuilt in JS on the site's
gamepad core, `/site/gamepad.js`, which handles edges, held-direction repeat and blur latching.
`pad.js` loads that core with a relative dynamic `import()`.

- **Move**: the left stick (radial deadzone 0.2, rescaled so speed is analog) or the D-pad,
  alongside the keyboard and touch. `G.Input.axis()` asks `G.Pad.axis()` after touch.
- **Actions** (remappable):

  | Action | What it does | Xbox | PlayStation | Nintendo |
  |---|---|---|---|---|
  | prev / next | switch move (Q / E); cycle a screen's tabs; walk the level-up cards | LB / RB | L1 / R1 | L / R |
  | pause | pause / resume (Esc) | Menu | Options | + |
  | confirm | press the focused control; pick the focused card | A | ✕ | **A (right face)** |
  | cancel | back on every screen; resume from pause | B | ○ | **B (bottom face)** |
  | reroll | reroll the level-up cards (R) | Y | △ | X |
  | zmove | the Z-move (Z), M5 batch 4 | LS (L3) | L3 | LS |
  | dynamax | Dynamax (C), M5 batch 5 | View | Share | − |

  View / Back with nothing bound to it works as back in menus and as pause in a run (by default it
  is now Dynamax, the port's `JOY_BUTTON_BACK`; pause stays on Start). In a run the port's extras
  also fire the Z-move: the reroll button (Y / △ / X, which only rerolls on the card screen) and
  the right trigger when nothing is bound to it; and Dynamax: the left trigger and the left face
  button (X / □ / Y) when nothing is bound to them. The port's **ban and swap** actions come with
  their M5 batches (in-run card ban, team mode). A map saved before an
  action existed keeps its buttons; the new action gets its default, or the first free button if
  a remap already took it.
- **Layouts**: Xbox, PlayStation and Nintendo. Nintendo swaps confirm and cancel. It is the
  default (the site standard, also read from `magepunk_pad_v1`). Picking a layout resets the
  mapping to that layout's defaults.
- **Settings → Controls** has the layout picker, a **remap** row per action, a vibration switch
  and **Reset mapping**. To remap, select a row, then press any button except the D-pad or Guide.
  If another action already used that button, the two actions **swap**. Keyboard Esc or 8 s
  without a press cancels. Everything is saved in `micasurvivor_settings` (`padLayout`,
  `padMap`, `padRumble`).
- **Glyphs**: button icons drawn as SVG, the same per-layout set as the port's `padicons.gd`.
  They appear on the level-up / item / bond cards (the focused card shows confirm), the
  "1 2 3" and "R" prompts, the pause hints, the HUD (LB / RB beside the move bar, plus the first
  14 s hint line), the menu hint bar, and the remap rows. `body.pad-input` switches every prompt
  to glyphs while a pad is in use. Any key, mouse click or touch switches back to keys.
- **Focus navigation**: every screen and overlay (title, test, menu, Pokémon, Upgrades, Gacha
  with the slot machine, Missions, Settings, Credits, pause, cards, summary...) has a gold focus
  ring. Focus moves spatially with the D-pad or stick. Confirm presses the focused control. Left
  and right change a `<select>` or slider. Cancel is back everywhere. The right stick scrolls long
  panels. The first press after keyboard or mouse use only shows the ring. Cards that pop up in a
  run ignore confirm for 0.4 s, so a held button can't pick one by accident.
- **Hot-plug**: the first pad that presses something drives. Other pads are ignored until it is
  unplugged. **Rumble on hit** (`player.hurt`) is optional and off by default.
- **Site rule**: controller play is for **signed-in** Magepunk players (owner decision
  2026-09-28, the same as the overworld, Battlecards and Micatro). A guest's pad only shows
  "Log in to Magepunk to use a controller". The game itself still plays fully for guests with
  keyboard and touch. One switch turns this off: `SIGNED_IN_ONLY` in `pad.js`.

## Mechanics from the Android port

M5 brings over every mechanic the Godot Android port by **JayElDragon** (MIT,
https://github.com/JayElDragon/poke-survivor) added to the game, one batch at a time
(`Plans/MICASURVIVOR_PLAN.md` → M5). The behaviour and the numbers are the port's; the code is
the web game's own (no GDScript translated line by line). Every edit is marked `MicaSurvivor (M5)`.

### Batch 1: Foundation

- **Kills per type** (`js/systems/progress.js`, port `progress.gd` "tk_"): every enemy that falls
  adds 1 to `save.stats.tk_<type>` for each of its types (a Charizard counts fire and flying), for
  life. `G.Progress.typeKills(type)` reads it. The save merge (`js/core/db.js merge()`, used for
  the Magepunk account's 409 conflicts and the guest carry-over) keeps the max of every stats
  key, so two devices never lose counts.
- **Enemy status effects** (`js/systems/status.js`, `G.Status`; port `main.gd` 213-216 and
  2489-2641), next to the web's burn / poison / slow:

  | Status | Lasts | Effect |
  |---|---|---|
  | Frozen | 1.8 s | doesn't move or attack (only knockback moves it); takes +25% damage |
  | Paralysed | 3 s | 40% speed; attacks and shoots 2.5x slower; takes +35% electric damage |
  | Asleep | 4 s | doesn't move or attack; the next hit does +30% and wakes it (hits from sleep moves don't) |
  | Confused | 3 s | wanders toward the nearest other enemy (within 380) and hits it every 0.6 s for 1.8x its damage + 3% of the target's max HP (1.2% on a boss), waking it; doesn't attack you |

  Bosses get 35% of freeze / sleep and 50% of paralysis / confusion, then are immune for 4 s.
  Darkrai (491) never falls asleep ("Immune!"). A frozen or sleeping enemy can't be paralysed or
  confused; freezing ends sleep and confusion, sleep ends confusion. Moves carry `cc` (the status)
  and `ccp` (the chance per hit), the port's values: Grass Knot (sleep 6%), Thunder Shock (para
  18%), Discharge (7%), Thunderbolt (15%), Confusion (conf 14%), Psybeam (12%), Psychic (10%), Ice
  Beam (freeze 15%), Powder Snow (7%), Lick (para 20%), Night Shade (sleep 8%), Hail (freeze 12%),
  Hypnosis and Dream Eater. Every hit goes through one function, `G.Combat.land()` (projectiles,
  orbs and fields included). Hex counts these statuses too. The new-move card says the chance
  ("Can freeze (15%)."). The indicators are drawn in code, no new art: an ice block, rising
  "Z z z", yellow sparks, pink stars circling the head, a coloured patch on the ground, and a
  floating "Frozen!" / "Paralyzed!" / "Asleep!" / "Confused!" when it starts.
- **Hypnosis** (aura, radius 120, 5 damage, 30% sleep) and **Dream Eater** (aura, radius 150, 46
  damage, only hits sleeping enemies, heals 1.2% of your max HP per enemy hit, doesn't wake them)
  are new psychic moves (`js/data/moves.js`). Their icons are generated like the others
  (`G.Icons`, the psychic emblem + the aura badge); their effects come from `js/entities/vfx.js`.
- **Alternative evolutions** (`G.Moves.EVO_ALT`, port `moves_data.gd` 99-110 and `main.gd`
  1484-1532): 9 moves have a second evolution. Gust → Colossal Cyclone needs **Calibre**; Fire
  Spin, Petal Blizzard, Bulldoze, Discharge, Flamethrower, Toxic, Flame Wheel and Razor Leaf need
  the **Big Orb** item. When both evolutions of a move are ready, both gold cards come up together
  and the player picks one. A missing stat shows its card flagged "Evolves <move>". The Big Orb
  ("Colossal Orb") is an item since batch 3. The hook is `Player.hasItem('bigorb')`, which also gives x1.3 size.
  **EVO_EXTRA** (`moves_data.gd` 112-118) adds the port's extra tweaks to five normal
  evolutions: Confusion x1.6, Rock Throw x1.6 and knock 30, Shadow Ball x1.3, Fairy Wind x1.5,
  Gust x1.6.
- **Knockback by move level** (`G.Moves.KNOCK_LV` / `knockOf()`, port `moves_data.gd` 94 and
  `main.gd` 1405-1410): 20 moves push nothing at Lv1. From Lv2 they push the table's value (+50%
  for each level after that) plus their own knockback, and x1.5 once evolved. For example, Hyper
  Voice pushes 0 / 260 / 390 / 520 / 650, then 975 evolved. Beams and auras now pass their
  knockback on too, so Hydro Pump, Bulldoze and Bug Buzz push.
- **Calibre** (`js/systems/levelup.js`, port `main.gd` 143-156 and 1397-1420): a level-up stat card,
  +12% size of projectiles, orbs and areas, up to 6 times. `Player.sizeK()` = permanent upgrade
  (`perks.size`, the Caliber upgrade of batch 3, +8% a level) x 1.12^cards x Big Orb 1.3. Combat attacks
  with a scaled view of the move (`G.Combat.eff()`): the radius of auras, melee, mines, meteors,
  cones, chains, trails, beams, boomerangs and dashes; projectile / orb size; beam width. The orbit
  ring itself grows half as much.
- Every new string is in `js/data/lang-en.js`. The English is taken from the port's own
  `lang_en.json`.

**Kept as the web has them:** melee balance and the altars (owner). The port's base numbers for
the moves (it rebalanced many) are **not** taken. Only the `cc` / `ccp` fields, the two new
moves, the alternative evolutions, EVO_EXTRA and KNOCK_LV are.

**Not yet (later batches or co-op):** the port's status traps (freeze / shock / sleep / confuse
pads that also hit you) and the ability / Z-move sources of these statuses come with those
batches. In co-op (still "Coming soon"), a partner's statuses on the host's enemies, and a
partner's alternative evolution in the ghost replay, are not synced.

### Batch 2: Abilities

Every Pokémon has one **passive ability** (`js/systems/abilities.js`, `G.Abilities`; port
`abilities.gd` and its hooks in `main.gd`). There are 54 abilities. The per-dex table is the
port's own: all 966 Pokémon are listed, and the port's fallback (Protean) is never needed. The
numbers are the port's:

| Family | Abilities | Effect |
|---|---|---|
| Pinch | Blaze, Overgrow, Torrent, Swarm | below 40% HP, moves of that type deal +35% |
| Flat damage | Huge Power ("Power") +25%, Guts +12% (and 4% less taken), Technician +10%, Protean +8% (and +4% speed), Mold Breaker +6% (and +10% vs bosses) | multiplies attack |
| By move | Iron Fist (melee), Mega Launcher (projectile / beam / boomerang / cone / chain / meteor) +20%; Adaptability +20% with your own types; Drought (fire), Drizzle (water), Snow Warning (ice), Sand Stream (rock + ground) +15% | multiplies the hit |
| Hits | Tinted Lens: not-very-effective hits +40% · Moxie: +2% damage per 40 kills this run, max +20% · Defiant ("Competitive"): +15% damage for 4 s after you are hit | |
| Speed | Speed Boost ("Haste") +12%, Run Away +8% (and +5% XP); Swift Swim (rain), Chlorophyll (sun), Sand Rush (sand), Slush Rush (snow) +30% in that weather once it is past half strength | |
| Economy | Early Bird +12% XP, Pickup +20% coins at the end, Lucky +8% crit and +10% coins, Compound Eyes +10% crit, Magnet Pull ("Magnet") +40% magnet, Prankster -10% cooldown, Regenerator ("Regen") 1% max HP per second | |
| Defence | Intimidate 10%, Battle Armor 8%, Fur Coat 12%, Wonder Guard 35% less damage (added to defence, still capped at 80%); Thick Fat halves fire + ice; Water Absorb, Volt Absorb, Flash Fire, Sap Sipper halve their type; Solid Rock: super-effective hits -25%; Multiscale: the first hit every 25 s does half | |
| Sturdy | a hit that would KO you leaves 1 HP and 1.2 s of invulnerability, once every 90 s (after Focus Sash, as in the port) | |
| Contact | when an enemy touches you: Static 25% paralysis, Flame Body 25% burn (1 stack), Poison Point 25% poison (1 stack), Cute Charm 25% confusion, Effect Spore 20% sleep (through `G.Status`); Rough Skin hurts the attacker 12 + 3 x level | |
| Immunities | Levitate: map traps don't affect you · Sand Veil, Sand Rush, Slush Rush, Sand Stream: no weather damage · Inner Focus (sleep, confusion) and Limber (paralysis, freeze): status immunity | |

Where it plugs in: `Player` (`atk`, `spd`, `reduction`, `regen`, `hurt()` for the incoming
side and Sturdy, `update()` for the clocks); `G.Combat.land()` (every hit of yours, with the move
kind carried by projectiles and orbs as `mkind`); the contact loop in `G.Combat.resolve()`;
`G.Weather` (the chip damage; `level()` is exported now); and `G.Interact.trapEffect`. Cooldown,
magnet, XP, coins and crit are multiplied in once by `G.Abilities.set(pl, id)`, which also undoes
the previous ability. That is the call team mode (batch 7) will make when it swaps the active
Pokémon. The Sturdy and Multiscale clocks belong to the player, as in the port.

**Shown:** a gold chip "✦ Blaze" at the start of the HUD's buff row. It lights up while the
ability is acting (low HP for the pinch ones, Defiant, the weather boost, Sturdy or Multiscale
ready), shows the recharge ("62s") or Moxie's bonus ("+6%"), and tapping or clicking it shows
what it does. It also appears in the Pokédex detail (under the stats), the main-menu partner card
(the description is the tooltip), the personality result, the starter choice and the pause screen.
The English is the port's `lang_en.json`, so some names differ from the games: Power, Regen,
Haste, Magnet, Lucky, Competitive, Snowfall. The design wiki lists the abilities and gives each
Pokémon's ability (`tools/micasurvivor/gen_designwiki.mjs`).

**Approximations and hooks:**
- Inner Focus and Limber only matter against the port's status traps that hit the player
  (sleep / confusion / paralysis / freeze pads). Those are not ported yet. `G.Abilities.statusImmune(pl,
  kind)` is ready for them, and the test checks it.
- The port's Safety Goggles and Heavy-Duty Boots items (same immunities as Sand Veil and Levitate)
  came with batch 3: `trapImmune()` / `weatherImmune()` check them too.
- The web slows non-ice Pokémon in snow. The port has no such slow for the player, so Slush Rush
  and Sand Veil don't remove it, as in the port.
- In co-op (still "Coming soon") each player's ability applies on their own machine. A partner
  copy has its ability set, but its stats come over the network.

### Batch 3: Items and upgrades

**15 new held items** (`js/data/items.js`, port `types_data.gd` ITEMS and their hooks in
`main.gd`), 26 in all, in the port's order. They drop where the web's items always did (bosses
always, locked chests 50%, plain chests 8%). As in the port, every item has the same chance,
you never roll one you already hold, and the species-locked ones only drop for the Pokémon that
can use them (`G.Items.roll()` / `okFor()`). The icons are the port's pixel art, copied as-is
from `data/icons.json` "ui" (the Colossal Orb from `icons.gd` EXTRA) into `G.Icons.UI`.

| Item | Effect | Where it plugs in |
|---|---|---|
| Never-Melt Ice | an enemy that hits you is 30% slower for 2 s | the contact loop in `G.Combat.resolve()` |
| Scope Lens | +15% critical hit chance | `critChance`, on equip / unequip |
| Expert Belt | super-effective hits x1.25 | `G.Items.outK()` in `G.Combat.land()` |
| Wide Lens | x1.2 radius (and reach) of every move | `G.Combat.eff()` |
| Colossal Orb (Big Orb) | x1.3 size; enables the 8 Big Orb alternative evolutions of batch 1 | `Player.sizeK()`, `hasItem('bigorb')` |
| Type Gem | x1.2 with moves of your Pokémon's types | `outK()` |
| Sitrus Berry | when a hit leaves you below 50%, heal 30% of max HP, once every 90 s | `Player.hurt()` |
| Heavy-Duty Boots | map traps don't affect you | `G.Abilities.trapImmune()` |
| Safety Goggles | no sandstorm / snow damage | `G.Abilities.weatherImmune()` |
| Weakness Policy | a super-effective hit on you gives x1.5 attack for 8 s | `Player.hurt()`, `Player.atk` |
| Rare Candy | +1 level at once (its level-up cards come up); takes no slot | `offerItem()` in `game.js` |
| Pure Incense | 25% fewer enemies (x0.75 spawn rate), each with x1.3 HP and x1.5 XP; coins picked up x1.25 | `G.Spawner`, coin pickup |
| Light Ball | Pichu, Pikachu, Raichu only: Electric x2 | `outK()`; drops only for them |
| Thick Club | Cubone, Marowak only: Ground x1.5 | `outK()`; drops only for them |
| Silver Powder | Bug moves x1.2 | `outK()` |

**Carry two** (`Player.item2`, `itemSlots()`, `items()`, `equip(id, slot)`; port `main.gd`
5754-5793): with the Backpack upgrade you hold two items. A new one goes into a free slot by
itself. With both full, the item screen shows three cards: replace slot 1, replace slot 2, or keep
both (keys 1-3, or the pad). Without the Backpack it is the web's two-card choice as before.
`hasItem()` checks both slots. The HUD stacks the second slot above the first, each with its name.
The Tower's "Double baggage" pact (batch 8) only has to set `Player.bagPact = true`.

**4 new permanent upgrades** (`js/data/upgrades.js`, port `save_data.gd` UPGRADES / perks), each
bought per Pokémon like the others:

| Upgrade | Levels | Cost per level | Effect |
|---|---|---|---|
| Caliber | 6 | 80 · 110 · 160 · 220 · 310 · 430 | +8% size per level (`perks.size` -> `Player.sizePerk`, the permanent half of `sizeK()`) |
| TM | 1 | 2000 | choose your starting move: "Choose" opens the editor under the row (port `menu.gd` `_tm_panel`). The pool is the Pokémon's types plus Normal, without support moves (Mew: every move). Changing it is free. The pick leaves the ban list (`G.tmPool`, `G.tmPick`, `G.tmSet` in `js/data/starters.js`; `G.startMoveOf()` returns the pick while the TM is owned) |
| Second Chance | 2 | 2500 · 5000 | a heart per level: a lethal hit spends one and you revive with full HP, 2.5 s invulnerable, and every enemy within 260 is knocked away (500). It comes after Focus Sash and Sturdy. The hearts show next to the HP bar |
| Backpack | 1 | 7500 | two item slots (above) |

The web's **free card reroll** stays (the port has none). The TM editor is plain buttons in the
upgrades screen, so the pad's focus navigation reaches it. While doing this, `G.Pad`'s D-pad
navigation got a 2:1 cone: going right from a wide price button no longer jumps to the row above.

**Saved and merged:** levels go in `save.pupg[dex]`, as before. `G.DB.merge()` keeps the max of
every level, so new ids need nothing extra, and `sanitize()` clamps a hand-edited level to the
max. The TM pick is `save.ptm[dex]` (a move id; sanitized). On merge the newer save's pick wins,
and Pokémon it has no pick for take the other save's. The "Item collector" achievement now asks
for all 26 items, as the port's does.

**Approximations:**
- **Rare Candy** is used the moment you pick it up. The port shows it as an item card (take or
  keep yours). The item's own text says "Gain 1 level when you take it (doesn't use a slot)", and
  turning a free level down makes no sense.
- **Drop places and rates** stay the web's. The port also rebalanced its chests (16% item chance,
  guaranteed when you hold none) and enemies (1.5% item drop). That is a separate balance change,
  like the altars and melee balance the owner kept.
- **Bug fix found by the tests:** Focus Sash's clock started at -999 ms against
  `performance.now()`, so the Sash could not save you during the first minute after the page
  loaded. It starts at -Infinity now (regression test in the items suite).
- In co-op (still "Coming soon") items stay per player, as before. Pure Incense reads the host's
  items.

### Batch 4: Z-moves

One **Z-move** per type (18), each with its own choreography (`js/systems/zmoves.js`, `G.ZMoves`;
port `zmove.gd`, `main.gd` 171-182 / 1226-1322 / 8504-8594, `save_data.gd` 250-266 / 479-551,
`progress.gd` 233-289, `menu.gd`). The numbers are the port's.

| Rule | Value |
|---|---|
| Usable from | level 15 |
| Cooldown | 240 s, counted after the move **ends** (so not during the cinematic or the move) |
| Cinematic | 2.2 s: the world and the run clock stop, the screen dims, a banner opens with rotating rays, speed lines, the type's Z-crystal and the name falling letter by letter (white flash on the first letter; a third of it with "Fewer flashes") |
| Invulnerable | the whole time (the cinematic, then 0.3 s renewed every frame of the move; lava and "pure" damage too) |
| Damage | (100 + 24 x level) x attack, times each hit's factor; every hit goes through `G.Combat.land()` (type chart, crit, ability, items) |
| Bosses | one Z takes at most 28 % of a boss's max HP in total (counted after every multiplier: `enemy.hpFloor` during the hit). A boss with less than 28 % left can still fall |
| Not allowed | the Tower (`G.Game.mode === 'tower'`, the flag batch 8 sets), a rift arena (`G.Rift.inArena`), the Judgment of Arceus (`G.Judgment.active`) |

The 18 plans, as in `zmove.gd`: Starlight Dash (three dashes, then a blast), Pyrotechnic Holocaust
(a crown of 24 will-o'-wisps drawn in code, each launched at an enemy), Abyssal Hydro Vortex
(pulls everything in, a final wave), Gigavolt Storm (three chains of up to 14 bolts that
paralyse), Cataclysmic Bloom (roots: slow, squeeze, bloom and heal 2 % per enemy, max 25 %),
Absolute Zero (freeze all, then shatter), Total Crush (22 blows on the strongest enemy, then an
uppercut), Acid Deluge (9 acid pools that poison), Tectonic Fury (three waves of 5 cracks), Supersonic
Dive (vanish, dive on the densest group), Shattered Mind (6 waves of confusion), Devastating
Plague (16 bugs hunting on their own, poison + slow), Continental Avalanche (two rock walls across
the screen), Eternal Nightmare (8 drains: 22 % + 7 % of the enemy's HP, heal up to 18 %),
Draconic Cataclysm (4 spinning dragon beams), Abyssal Eclipse (a shrinking dark ring, then an
implosion), Metal Drill (a 900-unit drill dash, then an explosion) and Dreamy Flash (sleep all,
heal over time, then eat their dreams). The effects use the shapes of `js/entities/vfx.js`, the
sounds `legend` (start) and `bossDown` (the move).

**Unlocking** a type's Z (any of):
- **250 defeated** of that type (`stats.tk_<type>` from batch 1);
- its **Z-crystal mission** (18, port `progress.gd` ZMIS, 500 coins each, checked with the
  achievements): defeat 1,500 Pokémon (normal), survive 8 min (fire), play 15 runs (water), reach
  level 25 (electric), open 25 chests (grass; `stats.chests` is new and counts every chest), 30
  gacha pulls (ice), 10 bosses (fighting), evolve 10 moves (poison), own 30 Pokémon (ground),
  find 10 items (psychic), win 5 rift fights (ghost), survive 12 min (dragon), 3 legendaries
  (dark). Five read stats that later batches write: 5 Daily Challenges (flying, batch 6), 4 Boss
  Rush bosses (bug, batch 8), Tower floor 8 (rock, batch 8), 8 min of Type Survival (steel,
  batch 6), 8 min of Team Mode (fairy, batch 7). Until then those unlock by kills or the gacha;
- a **Z-crystal from the gacha**: each x10 pull has a 3 % chance to give the crystal of a type
  still locked (never on x1, nothing once all 18 are unlocked). The pull result shows it, and the
  gacha's rates panel shows the 18 crystals (locked ones dimmed).

The **Z type follows the active Pokémon**: it is read from `pl.dex` when you use it (the port fixed
it at the start of the run). Team mode (batch 7) only has to change the active Pokémon. A Pokémon
with two unlocked types uses the first, or the one chosen in its **Pokédex** entry (a button per
type, focus-navigable). Missions has a new **Z-Crystals** tab with the 18 missions, their
progress and the kills of each type.

**Input:** the Z key, the round **HUD button** (bottom right; click or tap it; it pulses when
ready, shows "Lv. 15", the cooldown "3:58" or "Not here", and the Z key or the pad's zmove glyph
in its corner), and the controller's `zmove` action (above).

**Saved and merged:** crystals are `stats.zcr_<type> = 1` (as in the port), so the merge's max of
every stat makes them a union, like the kills. Completed missions are `save.zmis[id]` (union).
The per-Pokémon choice is `save.pz[dex] = { type, at }`: on merge (`G.DB.merge()`, used by the
account's 409 path and the guest carry-over) the choice with the latest `at` wins for each
Pokémon, whichever save is newer. `sanitize()` drops bad types, unknown Pokémon and bad mission
keys. The carry-over text now lists Z-moves among what is merged.

**Deviations, and why:**
- The **Z type is read at use time** (the port's bug: it was fixed once per run).
- The Z button is shown **greyed in a rift arena / the Judgment** ("Not here"); the port showed it
  ready but did nothing. In the Tower it is hidden, as in the port.
- The Pokédex shows **one button per unlocked type** instead of the port's single "Switch Z-Move"
  button that cycles.
- The **boss cap** clamps the HP during the hit (`hpFloor`) instead of refunding the excess
  afterwards: the port's refund came after the death check, so a capped hit could still kill.
- The steel and flying final bursts start where you land, not at the starting point (a visual fix).
- Screen shake uses the web's camera (port shake / 7, x0.25 with "Fewer shakes").
- The HUD button has a fixed place (it is not in the touch layout editor yet).
- In co-op (still "Coming soon") a guest's Z hits the host's enemies through the usual hit
  forwarding; the boss cap and the statuses are only enforced on the host's own enemies.
- The HUD level label: "Nv. {x}" now has an English pattern, so the HUD level reads
  "Lv. 20" in English (it used to stay "Nv.").

### Batch 5: Dynamax and raid dens

**Dynamax** (`js/systems/dynamax.js`, `G.Dynamax`; port `dynamax.gd` whole, `main.gd` 183-189 /
383-385 / 1226-1281 / 4216 / 4263 / 5867-5870 / 5903-5936 / 5990-5996 / 6037-6051 / 6189-6221, HUD
`draw_dyn` 8430-8503). The numbers are the port's.

| Rule | Value |
|---|---|
| Unlock | clear one **raid den** (`stats.dens >= 1`, plus `stats.dynamax = 1`) |
| Usable from | level 20 |
| Lasts | 60 s; then a 240 s cooldown (counted only after it ends). Every den cleared recharges it at once (the port's "Dynamax Candy") |
| Stats | +30 % to all: damage x1.3, speed x1.3, cooldowns /1.3, 23.08 % less damage taken (`pl.dyn`, read live in the `Player` getters, so the end reverts exactly; `cdMul` is now a getter over `_cdMul`) |
| HP | max HP +30 % (rounded), current HP up by the same; at the end the bonus goes and HP keeps its proportion (never below 1) |
| Size | the sprite (and shadow and aura) grows in Super Mario Bros DS steps 1.22x1.0, 1.04, 1.42x1.3, 1.16x1.2, 1.792, 1.6 (0.9 s, a flash + sound + ring on three of them); shrinks back in 0.35 s. Hit radius unchanged, as in the port |
| Max waves | every 1.5 s (the first at 0.6 s): (30 + 8 x level) x attack, radius 280; every 3rd radius 420, x1.9 and a ring of stars. Through `G.Combat.land()` via the Z-move helpers (`G.ZMoves.area`), with the type's status from the port's STATUS table: electric paralyses, ice freezes, ghost sleeps, psychic / fairy confuse, poison / grass poison, water / bug / ground slow 40 / 35 / 30 % |
| Not allowed | the Tower (`G.Game.mode === 'tower'`), the Judgment of Arceus, during a Z-move cinematic. **Allowed in rift and den arenas** (the port's `_dyn_can` does not block them, unlike the Z-move) |
| Ends early | when you fall; `G.Dynamax.stop(pl)` is the hook team mode (batch 7) calls on a swap |

On screen: a red aura drawn in code (light puddle, glow, spiralling red / violet mist, sparks), a
pulsing red border, a time bar "DYNAMAX 42 s", and the "DYNAMAX" banner whose letters drop and
bounce in (with a pink flash; a third of it with "Fewer flashes").

**Raid dens** (`js/systems/rift.js` + `dynamax.js`): from 120 s into a run, every 30 s rift check
has a 5 % chance to open a **den** instead of a rift (not in Rift Time Attack: `G.Game.mode ===
'rifts'`, batch 6; it does not touch the rift miss streak). A den stays open 30 s and is drawn in
code: a rocky crater with seven red crystals and a pulsing energy pit, and a red light pillar with
rising rings and sparks (additive, above everything). The notice, the arrow and the label turn red
("A DYNAMAX DEN HAS OPENED!", "DEN · 12 m · 30 s"). Inside waits a **normal Pokémon of the current
tier** (any candidate of that tier's BST band, not just the run's cast), in the arena of one of its
types: HP 2400 + 8 x t (scaled in co-op like the legendary), XP 380 + t, drawn 1.5x (sprite and
height) with the red aura and a red tint, and 28 % of its attacks become its **Max Move** (two
warned rings of explosions: 1 + 6 + 9 zones). Winning gives **12 big XP orbs (380 + t), 2 items,
2 tickets, 120 coins (12 x 10) and a heal**, all pulled to you, recharges Dynamax and counts
`stats.dens`; the first time it says "You unlocked Dynamax! MAX button, C key or left trigger
(from level 20)". A den is not a legendary (no `legends` entry), a rift win or a bond.

**Input:** the C key, the round **MAX button** above the Z button (click or tap; it pulses when
ready, shows "Lv. 20", the cooldown or "Not here", and the C key or the pad's glyph in its
corner; hidden until unlocked, in the Tower and while active), and the pad's `dynamax` action
(View / Share / − by default; plus the left trigger and the left face button when unbound).
Missions → **Z-Crystals** starts with a **Dynamax** card (unlocked or "Clear a Dynamax den: 0/1",
the rules, dens cleared).

**Saved and merged:** `stats.dens` and `stats.dynamax` ride on the merge's max of every stat, so
an account never loses the unlock (a newer save from another device without it merges it back).
No port mission or achievement reads the den count (`progress.gd` has none; the port only shows
it in its encyclopedia, batch 11), so nothing else changed there.

**Deviations, and why:**
- The time bar sits above the move bar, not at the top (the web HUD has the clock, the event line
  and the boss bar there).
- The MAX button shows greyed "Lv. 20" below level 20 (the port hid it, although its draw code
  has that state); the same for "Not here" in the Judgment.
- The den boss's red tint is a translucent red wash over the sprite (canvas has no `modulate`).
- The arena's normal boss scale (`bossScale`) applies before the x1.5, as the port's boss scaling does.
- Co-op (still "Coming soon"): the host decides dens (`'rift'` carries a den flag, the arena cfg
  `den: true`), each player's save counts the den, only the host drops the reward; a partner's
  Dynamax is not mirrored on other screens yet.

## Tests

- `node overworld/tests/micasurvivor_boot_test.mjs` covers boot (no console errors, no external
  requests), guest start, a 30 s bot run with level-up picks, and the save round-trip through a
  reload.
- `node overworld/tests/micasurvivor_phone_test.mjs` is the 390px phone smoke test (touch
  controls).
- `node overworld/tests/micasurvivor_pad_test.mjs` covers the controller with a synthetic Gamepad
  API: the guest gate, title to run with the pad only, every menu screen, the gacha, layouts, remap
  with swap-on-conflict surviving a reload, stick and D-pad movement, pause, level-up reroll and
  pick, glyphs switching between keys and pad, rumble, and hot-plug.
- `node overworld/tests/micasurvivor_server_test.mjs` (M3): the save actions (login, exact key,
  shape, size cap, 409 on a stale revision, one winner in a race, rate limit), the `micasurvivor`
  board, and the wiring (cabinet tiles, sprite, landing tile, sitemap).
- `node overworld/tests/micasurvivor_account_test.mjs` (M3): the real server in the loop — playing
  as the Magepunk user, two devices merging, the guest carry-over (take over / merge / decline),
  the leaderboard screen.
- `node overworld/tests/micasurvivor_arcade_test.mjs` (M3): the Pewter Museum cabinet, walked to
  and opened with the overworld controller, and the way back.
- `designwiki_micasurvivor_test.mjs` and `magepunknews_micasurvivor_test.mjs` (M3): the wiki
  section and the news entry.
- `node overworld/tests/micasurvivor_mechanics_test.mjs` (M5 batch 1) steps a paused run by
  hand and checks every rule above with numbers: kills per type (a real kill, saved, back after a
  reload, merged by max), each status's duration, boss resistance and immunity, frozen +25%, sleep
  +30% and wake, paralysis speed / attack rate / +35% electric, confusion infighting, Darkrai, the
  cc moves and their roll through the real projectile code, Hypnosis, Dream Eater, choosing
  Colossal Cyclone in the real level-up screen, the Big Orb hook, EVO_EXTRA, knockback per level
  (a real Hydro Pump hit), Calibre scaling (a real aura and Ember shot) and its cap, and the
  English of every new string.
- `node overworld/tests/micasurvivor_abilities_test.mjs` (M5 batch 2): the 54 abilities and the
  966-entry table; every fx key handled and every ability measurably doing something (no silent
  no-ops); each family with the port's numbers (pinch, flat stats, weather speed and immunity,
  contact chances through the real contact loop and over 4000 rolls, type halving, Solid Rock,
  Multiscale's 25 s, Sturdy's 90 s, Defiant's 4 s, the Moxie steps and cap, Tinted Lens, Mold
  Breaker, Iron Fist / Mega Launcher through real casts, Levitate against real traps); swapping an
  ability back exactly; and the HUD chip, the Pokédex, the partner card, the result, the starters
  and the pause screen, in English.
- `node overworld/tests/micasurvivor_items_test.mjs` (M5 batch 3), logged in with a stubbed account
  row: the 26 items and 17 upgrades (order, icons, costs, English); buying Caliber / TM / Second
  Chance / Backpack in the real screen; the TM editor driven by a synthetic gamepad; the upgrades
  and the TM pick reaching the account, surviving a reload and a 409 merge (max levels, a clamped
  hand edit); a run with them; every new item's effect with numbers (a real Ember for Type Gem, the
  real contact loop for Never-Melt Ice, real traps and sandstorm for the Boots and Goggles, the
  spawner for Pure Incense, 3000 rolls for the species locks); Rare Candy; carrying two (auto-fill,
  the 3-card choice, keys, HUD); Second Chance revive and knockback; the Focus Sash regression.
- `node overworld/tests/micasurvivor_zmoves_test.mjs` (M5 batch 4), logged in with a stubbed account
  row: the 18 Z-moves (names, numbers, icons, English); each unlock route (the 250th kill, the
  mission paying once, 3 % of x10 pulls over 30000 rolls only for locked types, the real pull and
  gacha screen); the Z-Crystals tab; the Pokédex choice picked with a synthetic gamepad; the account
  push and a 409 merge (union, newest choice per Pokémon), `merge()` both ways, `sanitize()`; in a
  run the level-15 gate, locked types, the type following the active Pokémon, the Tower / rift /
  Judgment blocks, the real-time cinematic freeze, invulnerability, the cooldown after the end, the
  damage formula through a real hit, the 28 % boss cap; all 18 plans (duration, damage, their own
  effects); the Z key, the HUD button clicked on the canvas, the pad's zmove (L3), the right trigger,
  Y, remap with swap-on-conflict, an old saved map gaining zmove, the HUD glyph.
- `node overworld/tests/micasurvivor_dynamax_test.mjs` (M5 batch 5), logged in with a stubbed
  account row: the port's numbers and STATUS table, English strings; locked on a new save; the
  unlock by a real den clear (arena won), reaching the account, a 409 merge and `merge()` both
  ways; the level-20 gate; every stat x1.3 and max HP +30 % reverting exactly (a cooldown card taken
  meanwhile kept), HP in proportion, 60 s; the size steps; pulse cadence (40 in 60 s), radii,
  damage through a real hit and x1.9, the status of every type; the 240 s cooldown and the den
  recharge; falling and the swap hook; the Tower / Judgment blocks and arenas allowed; den odds over
  200000 rolls and thousands of real `G.Rift.update` checks (never before 120 s or in Rift Time
  Attack), 30 s open; the den boss (tier, HP, XP, x1.5, aura, Max Move with its 16 zones); the
  rewards; the C key, the MAX button clicked, the pad (View, left trigger, X), remap, an old map
  gaining dynamax, the glyph; the Dynamax card on the missions screen.
- Set `MICASURVIVOR_SHOTS=<dir>` to save screenshots.
