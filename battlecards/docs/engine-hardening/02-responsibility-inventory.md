# 02 — Responsibility Inventory

Legend — **Risk** = risk of behavior change if extracted/refactored now.
**Tests** = coverage in `battlecards/tests/characterization/` (ff1–ff10e, 495 assertions).

| Responsibility | Location (engine.js) | Key functions | State read | State mutated | Calls into | Tests | Risk | Future module |
|---|---|---|---|---|---|---|---|---|
| Game creation | 392–740 | `createGame` | cards.json defs | whole state built | instantiate, startOfGame pass, dealing | indirect (every suite) | Med | `GameEngine` |
| Player creation | inside createGame | player literal (~130 fields) | — | players[] | — | indirect | Med | `GameState` |
| Deck init | createGame + game.js deck loaders | deck id arrays, `startingDeckIds`, `startingHandIds` | defs | p.deck | shuffle via rng | ff8/ff10d (SoG) | Low | `GameState` |
| Turn progression | 13,312–13,814 | `endTurn` + internal turn-switch | nearly everything | nearly everything | fireOngoing, sweepDeaths, ~25 turn-cycle riders | ff6–ff10e heavily | **High** | `TurnManager` |
| Mana/resources | player.mana {cur,max,bonus} | `availableMana, spendMana`, ramp in turn-switch | p.mana | p.mana; hand `_manaWhileHeld`; cub growth | — | ff9, ff10d | Low | `ResourceService` |
| Cost calculation | 11,319–11,500 | `effectiveCost, heroPowerCost` (~60 stacked modifiers) | board/hand/played counters | **none (pure!)** | kindredActive, staticValue, schoolOf | ff5,ff9,ff10b-e | Low (pure) | `CostCalculator` — **pilot extraction** |
| Card legality | `canPlay` + can* family | canPlay, canPayMana/Alt, locks | mana, zones, locks, parity | none | effectiveCost, targetSpec | scattered | Low | `CardLegalityService` |
| Targeting | 911–1,160 | `targetSpec, legalTargets`, CHOSEN table (~60 entries) | effects, board | none | liveEffectsOf | implicit everywhere | Low (pure) | `TargetingService` — **pilot** |
| Card play | 11,501–12,370 | `playCard` (~350 lines: pay, consume ~20 discounts, route by type, battlecry, post-play hooks) | everything | everything | stackAction → resolvers | all suites | **High** | `CardPlayer` |
| Stack/priority | ~11,900–12,200 | `stackAction, offerPriority, resolveTop, resolveResponse, hasPriority` | stack, priority, passers | same | runSpell etc. | none directly | **High** (untested) | `PriorityManager` |
| Combat | 12,376–13,300 | `resolveCombat, attack, attackTargets, canAttackWith` | boards, weapons | damage, deaths, events | damageCreature/Hero, cleave, overkill/honorable | ff10a-e partial | High | `CombatResolver` |
| Hero attacks/weapons | same region + `equip`, `breakWeapon` | heroAttack, weapon DR | p.weapon | p.weapon, graveyard | execEffects (weapon DR) | ff8 (hammer) | Med | `CombatResolver` |
| Damage/heal | 1,166–1,480 | `damageCreature, damageHero, healHero, gainArmor` | shields, immunities, redirects | damage, life, armor, ~15 riders | fireSecrets, warptoothCheck, questTick | broad | **High** | `DamageResolver` |
| Summoning | 1,633–1,742 | `summon` (+12 entry riders) | board, per-name bonuses | board push | colossal parts, fireOngoing('summoned'/'enemy-summoned'), auras | broad | Med | `ZoneManager`/`SummonService` |
| Zone movement | scattered | toGraveyard, bouncePermanent, draw pipeline, deck splices | zones | zones | riders per zone | partial | **High** (scattered) | `ZoneManager` |
| Death detection/processing | 1,480–1,630 | `isDead`, `sweepDeaths` | boards | graveyard, corpses (×2 w/ Falric), reborn, starship pieces, replicator, commander retreat | runDeathrattle, per-death riders | broad | **High** | `DeathProcessor` |
| Deathrattles | 3,520–3,554 | `runDeathrattle` (+ rattleDouble, per-id switch) | card.deathrattle | via effects | execEffects | broad | Med | `DeathProcessor` |
| Trigger ordering | 1,922–2,240 | `fireOngoing` (zone scan order: enchantments→artifacts→emblems→board→weapon), `fireCreatureTrigger` (no cond gating!), `ongoingCondOk` (~40 conds) | ongoing/ongoings fields | trig.spent, counters | runSecretEffects | ff8-10e partial | **High** | `TriggerManager` |
| Secrets/traps | 2,212–2,244 | fireSecretsAll/fireSecrets, installSecret | p.secrets/traps | pops, graveyard | runSecretEffects | ff10d (enigma) | Med | `SecretManager` |
| Auras | 1,742–1,920 | `recomputeAuras` — delta-tracked (auraAttack/auraHealth/auraKeywords), idempotent by design | auras, equips, enrage, planes | c.attack/maxHealth/keywords via deltas | — | ff10a (hellbat) | Med | `AuraManager` |
| Buffs/enchantments | execEffects buffCreature closure + enchantment zone | buffCreature (+statGainBonus, doubleBuffs, counters) | — | stats | — | broad | Med | stays with effects |
| Silence | ~3,708 region | silenceCreature, `silence` effect (5 target modes) | keywords/fields | resets ~20 fields | — | ff8 (medivh) | Med | `EffectRegistry` handler |
| Hero powers | 11,565+ | heroPowerCost/canUse/useHeroPower (+corpseCost, wake hooks) | heroPowers[] | usedThisTurn, corpses | stackAction | ff4 (blessings), ff10e (thalena) | Med | `HeroPowerService` |
| Lands | 1,804–1,910 | landTaps/buyLand/tapLand/sacrificeLand | p.lands | p.lands, mana | execEffects | none | Med (untested) | `LandService` |
| Artifacts/equip | equip/canEquip + artifacts zone | equip, detach-on-death | p.artifacts | attachedTo | auras | none | Med (untested) | `ZoneManager` |
| Planeswalkers | walkerSpec/useWalker/planeswalk | + planar die | p.planeswalkers, state.plane | loyalty, plane | execEffects | none | Med (untested) | own module, later |
| Quests | questTick + quest zone | quest play path, progress, reward | p.quests | progress, reward exec | execEffects | ff10a (questsPlayedGame) | Low | `QuestService` |
| Discover/scry/modal | discover effect + 5 queues | resolvePick (**~20 pend option flags**: to/board, darkGift, duplicate, shuffleOthers, handPick, enemyDeckTop, gainStats, qonzu, cenarius, augur, holmes, guess…), resolveScry/Dredge/Ask/Discard/Sac | queues | queues + applied results | execEffects, summon | ff3,ff8,ff10c-e heavy | **High** (accreted flags) | `ChoiceService` |
| MP-specific | game.js:3417 host apply switch (~20 action kinds), snapshot fns | submit/apply, publish/ingest | snapshot allow-list | guest state overwrite | engine API | none | **High** (untested) | `persistence/` + facade |
| Elimination/victory | checkGameOver, damageHero fatal paths | over/winner/eliminated | life, secrets (Ice Block), heroDeathrattleCorpses | flags | fireSecrets | ff10d (husk) | Med | `GameEngine` |
| Random effects | 368 `state.rng()` sites | pool-pick idiom `pool[floor(rng()*len)]` | — | — | — | all (seeded 0.4) | Low | `RandomSource` (wrap) |
| Serialization | **game.js only** (snapshotState/snapshotForDuel) | JSON allow-list | players + queues | — | — | none | **High** | `GameStateSerializer` |
| Restoration | game.js duel ingest (spread rebuild) | — | whole `state` replaced | — | — | none | **High** | `GameStateSerializer` |
| Event logging | emit/takeEvents, 175 types | — | state.events | push/drain | — | indirect | Low | `EventBus` (thin) |
| AI evaluation helpers | ai.js internal (threatScore etc.) | reads raw state | — | none | E.* API | none | Low | leave in AI |
| UI legal-action helpers | can*/spec* family | see 01 | varied | none | — | indirect | Low | freeze as facade |
