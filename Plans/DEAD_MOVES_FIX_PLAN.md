# Dead Moves + Doubles Switch Fix Plan

2026-08-26 audit finding: **23 damaging moves have `power: 0` in `overworld/data/moves_battle.json` and no
engine handler**, so they hit the `Pw <= 0` gate at `overworld/battle.js:1228` and print "But nothing
happened!". 20 of them are learnable (bide 84 species, counter 51, lowkick 43, magnitude 42, mirrorcoat 38,
naturalgift 31, beatup 27, heavyslam 27, …). Plus one adjacent HIGH bug: **doubles switch menus offer the
active ally**, aliasing `a.me === a.meAlly`.

## Engine facts (verified)

- `POWER_FX[id](battle, user, target, userBoosts, targetBoosts)` at `battle.js:313` computes dynamic power;
  called at `:1224`. The `move` object is NOT passed (Trump Card needs it — extend the signature).
- Fixed-damage kinds resolve at `battle.js:1338-1344` (`'level' | 'half' | 'psywave' | 'endeavor'` | number);
  `total <= 0` already prints "But it failed!" — ideal place for new kinds (counter-style, userHP, bide).
- Two-turn charge machinery exists: `fx.chargeText` + `user.chargeMove` (`:958-965`, AI honors it `:1850`,
  player `:3001`) — Bide reuses it.
- Damage lands at `:1389` (`target.curHP = Math.max(0, target.curHP - dealt)`) — the ONE place to record
  damage-taken memory. Substitute hits (`:1368-1377`) must NOT count for Counter/Bide.
- **No weight data exists anywhere in overworld/**. `tools/gen_battlescale.mjs` already parses Showdown's
  `pokedex.ts` (heightm) into species_battle.json — extend it to also write `weightkg`.
- `u.heldItem`, `this.itemFx(mon)`, `this.consumeItem(mon)` exist (Focus Sash, Acrobatics, Knock Off).
- **PvP is a SECOND engine**: `battlecards/pvpbattle.js` (pure-data, runs in the CF worker via
  `server/mp.mjs:17`). Its line 132 treats `!move.power` as a status no-op — the same 23 moves are dead
  there too. Parity is a separate phase.
- The AI likely scores moves by `mv.power` — today it never *picks* these moves (masking the bug); after the
  fix it needs estimated powers or it still won't use them. Verify `aiPick`/move-scoring during Phase 4.

## Phase 0 — doubles switch bug (ship first, ~15 min)

`a.party.filter(m => m !== a.me && m.curHP > 0)` at `battle.js:2092`, `:2107`, `:3291`, `:3394` →
add `&& m !== a.meAlly`. Also:
- Grep ALL `a.party.filter` sites (including forced replace-after-faint flow) for the same omission.
- Defense-in-depth guard at the top of `switchTo()`: refuse a mon that is already on the field.
- Test: doubles battle, open switch — assert ally absent from options; assert `a.me !== a.meAlly` invariant
  after every switch.

## Phase 1 — stateless moves (POWER_FX + new fixed kinds)

Pass `move` as a 6th POWER_FX arg (backward compatible). Add:

| Move | Handler |
|---|---|
| wringout, crushgrip | `max(1, floor(120 * t.curHP / t.maxHP))` |
| hardpress | same, 100 scale (0 learners today, 3 lines) |
| veeveevolley, pikapapow | flat 102 (return-twins; 0 learners, free) |
| trumpcard | `[200, 80, 60, 50][mv.pp] ?? 40` (pp AFTER decrement — check decrement order) |
| magnitude | roll tier 4-10 (10/20/20/20/20/5/5%) → power 10/30/50/70/90/110/150; `b.pushMsg('Magnitude N!')` from inside the handler |
| beatup | `20 + 15 × healthyPartyCount(user's side)` — helper `partyOf(user)`: player = `a.party`, foe trainer = foe party array (confirm field name), wild = 1 |

New EFFECTS entries reusing the fixed chain (`:1338`):
- `naturesmadness, ruination: { fixed: 'half' }` — identical to Super Fang. **Trivial, do first.**
- `finalgambit: { fixed: 'userHP', sacrifice: true }` — total = `user.curHP`; faint user after damage via the
  selfKO faint path but with a `sacrifice` flag that SKIPS the Damp check at `:1253`.

## Phase 2 — weight moves + data pipeline

1. Extend `tools/gen_battlescale.mjs` to also parse `weightkg:` and write it into species_battle.json
   (same idempotent/strip-stale/backup pattern; one tool now restores BOTH fields after
   export_web_data.py wipes — update the export reminder text in Magepunk66).
2. `battle.js` helper `weightOf(mon)` → species record's `weightkg || 50` (fakemon default 50kg).
3. POWER_FX:
   - `lowkick, grassknot` (target weight): <10kg→20, <25→40, <50→60, <100→80, <200→100, else 120.
   - `heavyslam, heatcrash` (user/target ratio): t > u/2→40, > u/3→60, > u/4→80, > u/5→100, else 120.
4. **Deploy owdata after regenerating** (species_battle.json lives on magepunk-owdata).

## Phase 3 — damage-memory moves (counter family + bide)

New per-mon state, recorded at `:1389` ONLY when the hit lands on the real mon (not substitute, not disguise):
`target.lastTaken = { amt: dealt, phys, from: user }` and `if (target.bideDmg != null) target.bideDmg += dealt`.
Clear `lastTaken` and `bideDmg` on switch-out and battle start (grep the existing per-mon volatile resets,
e.g. wherever `flashFired`/`enduring` are cleared).

- `counter: { fixed: 'counter' }` → `user.lastTaken?.phys ? 2 × amt : 0` (0 → existing "But it failed!").
- `mirrorcoat: { fixed: 'mirrorcoat' }` → special hits only, 2×.
- `metalburst, comeuppance: { fixed: 'metalburst' }` → either category, 1.5×.
- Singles: target is the attacker anyway. Doubles: acceptable simplification = hits the selected target;
  better = redirect to `lastTaken.from` if it's alive and on the field (we store the ref — cheap, do it).
- `bide: { chargeText: 'is storing energy!', fixed: 'bide' }` — simplified to ONE charge turn via the
  existing chargeMove flow: on charge turn set `user.bideDmg = 0`; on release, total = `2 × user.bideDmg`
  (0 → "But it failed!"), then reset. Check the fly/dig semi-invulnerable list keys off specific move ids so
  Bide doesn't dodge while charging; typeless like canon (fixed damage skips the type calc naturally).

## Phase 4 — item moves + polish

- `fling`: no held item → 0 (fails); else flat 60 power, `consumeItem(user)`, "flung its item!" message.
  (Optional: tiny power map for ironball/etc. if those items exist in the item system.)
- `naturalgift`: held berry → power 80 with the berry's canonical type (build `BERRY_GIFT` only for berries
  that actually exist in this game's item list); consume it; no berry → fails.
- `present`: 40/80/120 at 40/30/10%, and 20% → heal target `maxHP/4` instead (small bespoke branch before
  the damage calc, like other EFFECTS specials).
- AI: if move scoring uses `mv.power`, feed it estimates (call POWER_FX with current state, or a static
  EST_POWER map ~60-80 for the family) so the AI actually uses the newly-live moves.
- Cosmetic: move menus show `Pwr 0` for these (battle.js draw + pvp.js:278/:334) → show `Pwr —` when
  power is 0 but the move is in the handled set (or just when category !== 'Status' && !power).

## Phase 5 (optional) — PvP engine parity

`battlecards/pvpbattle.js:132` no-ops all of these. Minimal parity table inside pvpbattle.js:
level-damage (seismictoss/nightshade — check: they may already be dead in PvP too!), 'half' moves,
counter/mirrorcoat via the same lastTaken pattern, wringout/crushgrip HP-scale. Weight moves need
`weightkg` embedded in the mon snapshot at match creation (`createMatch` callers in mp.mjs). This changes
the worker → deploy is the main-site deploy, and determinism must be preserved (engine is
deterministic-per-call — keep RNG usage inside the existing rng, no `Math.random`).

## Testing & rollout

- New standalone test `overworld/tests` style (CHROME env pattern): build a scripted battle, force each of
  the 20 learnable moves via a fixed moveset, assert (a) damage > 0 or the correct documented fail message,
  (b) counter family responds only to the right category, (c) bide releases 2× accumulated, (d) weight
  tiers for lowkick/heavyslam against known-weight species, (e) doubles switch excludes the ally.
- Run the existing battle robustness test (webbuild/test_battle_robust.js via :8766) + full
  `battlecards/tests/run-all.mjs` before each push (battle.js is imported by main.js).
- Deploys: Phase 2 needs owdata deploy; all phases need main-site deploy. If the zone Browser Cache TTL
  hasn't been flipped to "Respect Existing Headers" yet, players hold stale battle.js up to 4h (nested
  import — can't ?v-bust it individually).
- Adjacent backlog NOT in scope (from battle-content-audit): 12 custom moves with no data + 20 status moves
  with no effect — separate pass.
