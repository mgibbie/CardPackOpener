// Micatro Multiplayer (PvP) — the engine's rules for a 2-player match: the Balatro Multiplayer mod's "Vanilla" ruleset,
// Attrition mode (re-implemented from its behaviour; see server/micatro_pvp.mjs for the referee).
//
//   newRun({..., pvp: {lives, pvpStart, deathOnLoss, comeback, mode, showdownStart, bossFx}})   -> a PvP run (session.js records
//   `recipe.pvp`; the stage-6 keys only when they are not the default, so an Attrition recipe reads as before)
//
// An internal mod ('pvp', hidden, never in G.GAME.mods — like the 'challenge' one), active only in a PvP run, so a
// solo run is untouched (no hook, no state, no RNG). What it does:
//   * the match's MODE (the lobby's, stage 6) decides which blinds are PvP rounds (pvpSlots):
//       Attrition (default): from ante `pvpStart` every Boss Blind is "Your Nemesis" (bl_mp_nemesis);
//       Showdown: from ante `showdownStart` (default 3) Small, Big AND Boss are all the Nemesis — a Nemesis in the Small /
//         Big slot counts as that slot for progression (blind_slot hook: Defeated in its slot, no ante step, not a boss);
//       Survival: no PvP blind at all, 1 life; the referee compares the furthest blind each player beat.
//     A PvP round has no score target (the Nemesis' chips are 0), you play ALL your hands (HAND_PLAYED -> DRAW_TO_HAND,
//     never "beaten"); out of hands -> the PVP_WAIT state until the referee's result. It pays its reward, never the
//     unused-hands money, and can't be skipped. Boss rerolls / disables never touch it.
//   * "Enable Boss Blind effects" (bossFx, the mod's normal_bosses): the PvP Boss is the ante's REAL boss, its effect on,
//     flagged PvP ("Most chips wins") — the same boss for both players: the shared seed rolls it, and nothing that could
//     re-roll it is allowed (boss rerolls are banned; Blind:disable / suspend are no-ops in a PvP round).
//   * a failed normal blind never ends the run: it counts as passed (its reward is still paid, as in the mod), costs a
//     life (deathOnLoss) and is logged for the referee (G.GAME.pvp.blinds); skipped and beaten blinds are logged too.
//   * no win at ante 8 (win_ante 999): the run goes on until a player is out of lives.
//   * comeback money: $4 ($2 at stake 6+) at the next cash-out after a life is lost.
//   * Attrition's bans + the mods' PvP-breaking cards (PVP_MOD_BANS: game-over savers, boss disablers / rerollers,
//     ante changers, boss-slot replacers, blind-target cutters) are banned.
//   * Pages (a base-game Micatro rule): offered on Small / Big (and a pre-PvP Boss) as in solo — the same seeded offer
//     for both players — but NEVER on the Nemesis blind (no target to change; a round rule would tilt the race and a
//     Pages screen would hold up the synchronised start).
// What the referee decides arrives as RECORDED actions, so resume / replay / spectators rebuild exactly what happened:
//   {type:'pvp_start_blind'}                     enter the Nemesis blind (after both pressed READY + the countdown)
//   {type:'pvp_outcome', result, lives}          the round's result ('win' | 'lose' | 'tie') + this player's lives
//   {type:'pvp_end', result}                     the match is over ('win' | 'lose' | 'draw')
//   {type:'pvp_timer', n}                        the Hurry timer ran out on this player: a life (n = the run's nth such loss)
//   {type:'pvp_hand_lost', n}                    the PvP timer ran out on this player in a Nemesis round: a hand (stage 7)
//
// Stage 7 — the RULESET (the lobby's; the mod's Vanilla / Balanced / Expanded) and THE ORDER:
//   * `order`: The Order (core.js theOrder): the run's random streams are keyed so both players get the same cards in the
//     same order however differently they play. A lobby option: on by default in Balanced / Expanded, off in Vanilla.
//   * Balanced: Hanging Chad retriggers the first AND second scoring cards once each; Bloodstone's rolls in a PvP round
//     come from a per-round queue both players share; Glass Cards are X1.5 (1 in 4 to break); Justice is banned. The two
//     reworked jokers replace the vanilla ones (silently banned) — the internal 'pvp_balanced' content mod, active only
//     in a Balanced / Expanded match (a Vanilla match's pools are exactly as before stage 7).
//   * the PvP timer (Balanced / Expanded; server/micatro_pvp.mjs): in a Nemesis round the player ahead may start a clock on
//     the one behind; it running out costs them ONE HAND — the recorded pvp_hand_lost.
// A recipe records `ruleset` / `order` only when not Vanilla / off, so a stage-6 recipe reads as a Vanilla match.
import { G, emit, P_CENTERS, localize, pseudorandom, probability_roll, probability_vars, order_round_based, ease_hands_played } from './core.js';
import { registerMod } from '../mods/registry.js';
import { DECKS_ID, MP_BACKS, MP_STAKES } from './pvp_decks.js';
import { EXPANDED_ID, setupExpanded, expandedActionError, expandedApply, expandedStartBlind, expandedSkipped, expandedView } from './pvp_expanded.js';

export const PVP_ID = 'pvp';
export const NEMESIS = 'bl_mp_nemesis';
/** The PvP rules version: bump when a change makes recorded PvP runs play differently. */
export const PVP_RULES = 1;

/** Attrition's own bans (the mod's gamemode list). */
export const ATTRITION_BANS = [
  'j_mr_bones', 'j_luchador', 'j_matador', 'j_chicot',
  'v_hieroglyph', 'v_petroglyph', 'v_directors_cut', 'v_retcon',
  'tag_boss',
  'bl_wall', 'bl_final_vessel',
];
/**
 * The mods' content that breaks the PvP rules the same way (audit 2026-11-08, every mod under micatro/mods): game-over
 * savers (a), boss disablers / Matador-likes (b), boss rerollers / boss-slot replacers (c), ante changers (d), extreme
 * or slot-changing bosses (e), blind-target cutters that would "win" a target-less blind (f), stakes / sleeves that do
 * any of it (g). A key a site doesn't have is harmless.
 */
export const PVP_MOD_BANS = {
  bunco: ['j_bunc_carnival', 'tag_bunc_breaking', 'v_bunc_disguise', 'v_bunc_masquerade', 'p_bunc_blind_1', 'p_bunc_blind_2', 'p_bunc_blind_3', 'p_bunc_blind_4'],
  betmma: ['v_betmma_art_gallery', 'v_betmma_reroll_cut', 'j_betmma_balatro_mobile'],
  morefluff: ['j_mf_lettergem_z', 'j_mf_rot_chicot', 'c_mf_negate', 'j_mf_sapling', 'v_mf_superboss_ticket', 'p_mf_superboss_normal_1', 'p_mf_superboss_mega_1',
    ...['violet_vessel', 'cerulean_bell', 'needle', 'manacle', 'pillar', 'serpent', 'club', 'goad', 'window', 'head', 'arm', 'wheel', 'house', 'psychic', 'hook']
      .flatMap((b) => ['c_mf_' + b + '_dx', 'bl_mf_' + b + '_dx']),
    'bl_mf_bigger_blind', 'stake_mf_final', 'j_mf_fleshprison'],
  pokermon: ['j_poke_shedinja', 'j_poke_mimikyu', 'j_poke_weezing', 'j_poke_mega_gyarados', 'j_poke_repel', 'j_poke_chiyu', 'j_poke_celebi',
    'j_poke_stunky', 'j_poke_skuntank', 'j_poke_wochien', 'stake_poke_elite'],
  pokermonplus: ['sleeve_sonfive_virtuoussleeve', 'j_sonfive_shroodle'],
  mikas: ['j_mmc_grudgeful', 'j_mmc_historical'],
};
/** Mod options a PvP run forces (whatever the host chose): Bunco's gameplay reworks turn Luchador / Boss Tag into boss tools. */
export const PVP_FORCED_OPTIONS = { bunco: { gameplay_reworks: false } };
/**
 * Survival's own bans. The mod bans its PvP-specific cards there (Survival has no opponent to hit) — Micatro has none yet, so
 * this list is where they go when they arrive. It also keeps the ante-lowering vouchers out: Survival is decided on the
 * furthest ante + blind each player reached, and an ante step back would replay blinds that already count (the mods' ante
 * changers are in PVP_MOD_BANS for the same reason). Attrition's other bans don't apply (no Nemesis to protect).
 */
export const SURVIVAL_BANS = ['v_hieroglyph', 'v_petroglyph'];
export const MODES = ['attrition', 'showdown', 'survival'];
/** The rulesets (stage 7): the mod's names, in its order. */
export const RULESETS = ['vanilla', 'balanced', 'expanded'];
/**
 * A ruleset's bans: `loud` are listed in the lobby (Justice), `silent` are vanilla cards a reworked copy replaces (the mod's
 * banned_silent: the vanilla Hanging Chad / Bloodstone leave the pools, their Balanced versions take their place).
 */
export const RULESET_BANS = {
  vanilla: { loud: [], silent: [] },
  balanced: { loud: ['c_justice'], silent: ['j_hanging_chad', 'j_bloodstone'] },
  // Expanded (stage 7b): Balanced + its own reworks (Golden Ticket, Seltzer, Turtle Bean, Ouija replace the vanilla ones) and the
  // Multiplayer cards, less the three the mod's Expanded bans (SPEEDRUN, Conjoined Joker, Defensive Joker)
  expanded: { loud: ['c_justice', 'j_mp_speedrun', 'j_mp_conjoined_joker', 'j_mp_defensive_joker'], silent: ['j_hanging_chad', 'j_bloodstone', 'j_ticket', 'j_selzer', 'j_turtle_bean', 'c_ouija'] },
};
/** The internal content mod each ruleset activates (on top of 'pvp'). */
export const RULESET_MODS = { vanilla: [], balanced: ['pvp_balanced'], expanded: ['pvp_balanced', EXPANDED_ID] };
/** Every internal mod id (never listed in G.GAME.mods). */
export const PVP_INTERNAL = [PVP_ID, 'pvp_balanced', EXPANDED_ID, DECKS_ID];
/** Does this ruleset play The Order by default (the lobby's default: on except in Vanilla)? */
export const orderDefault = (ruleset) => ruleset !== 'vanilla';
/** Every banned key of a mode + ruleset the lobby lists (for the lobby screen's count and the tests). */
export const pvpBannedKeys = (mode = 'attrition', ruleset = 'vanilla') => [...(mode === 'survival' ? SURVIVAL_BANS : ATTRITION_BANS), ...Object.values(PVP_MOD_BANS).flat(), ...((RULESET_BANS[ruleset] || RULESET_BANS.vanilla).loud)];

/** A PvP config, validated (the lobby's options; anything else in it is dropped so the recipe stays canonical). */
export function pvpConfig(c) {
  if (!c || typeof c !== 'object') return null;
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  const mode = MODES.includes(c.mode) ? c.mode : 'attrition';
  const out = {
    v: PVP_RULES, lives: int(c.lives, 1, 9, 4), pvpStart: int(c.pvpStart, 1, 8, 2), deathOnLoss: c.deathOnLoss !== false, comeback: c.comeback !== false,
    mode, showdownStart: int(c.showdownStart, 1, 20, 3), bossFx: c.bossFx === true,
    // (stage 7: absent = a Vanilla match without The Order — every recipe recorded before stage 7)
    ruleset: RULESETS.includes(c.ruleset) ? c.ruleset : 'vanilla', order: c.order === true,
  };
  // Survival: one life, and a failed blind is what ends it (no PvP round, so no boss option)
  if (mode === 'survival') { out.lives = 1; out.deathOnLoss = true; out.bossFx = false; }
  return out;
}
/** The config a recipe records (the stage-6 keys only when not the default: an Attrition recipe is as it was). */
export function pvpRecipeConfig(P) {
  const r = { v: P.v, lives: P.max, pvpStart: P.pvpStart, deathOnLoss: P.deathOnLoss, comeback: P.comeback };
  if (P.mode && P.mode !== 'attrition') r.mode = P.mode;
  if (P.showdownStart != null && P.showdownStart !== 3) r.showdownStart = P.showdownStart;
  if (P.bossFx) r.bossFx = true;
  if (P.ruleset && P.ruleset !== 'vanilla') r.ruleset = P.ruleset;
  if (P.order) r.order = true;
  return r;
}
/** Which blind slots of `ante` are PvP rounds under a config: {Small, Big, Boss} (server/micatro_pvp.mjs has the same table). */
export function pvpSlots(cfg, ante) {
  const mode = (cfg && cfg.mode) || 'attrition';
  if (mode === 'survival') return { Small: false, Big: false, Boss: false };
  if (mode === 'showdown') { const on = ante >= (cfg.showdownStart || 3); return { Small: on, Big: on, Boss: on }; }
  return { Small: false, Big: false, Boss: ante >= ((cfg && cfg.pvpStart) || 2) };
}

/** Is this run a PvP run? */
export const isPvp = () => !!(G.GAME && G.GAME.pvp);
/** Is the blind being played the Nemesis? */
export const inNemesis = () => !!(G.GAME && G.GAME.pvp && G.GAME.pvp_blind);
/** Is this slot of the current ante a PvP round? */
export const pvpSlot = (slot) => isPvp() && !!slot && !!pvpSlots(G.GAME.pvp, G.GAME.round_resets.ante)[slot];

// Balanced's Glass Card: X1.5 (the vanilla center is changed for the match only; every newRun puts it back first)
const GLASS_VANILLA = { ...P_CENTERS.m_glass.config };
const GLASS_BALANCED = { Xmult: 1.5, extra: 4 };
/** newRun, before anything else: the vanilla centers a ruleset reworks, as they were (a solo run after a match). */
export function pvpReset() { Object.assign(P_CENTERS.m_glass.config, GLASS_VANILLA); }

/** newRun: the run's PvP state, its bans and win_ante (after init_game_object + the mods' hooks, before the boss roll). */
export function setupPvp(cfg) {
  const P = { ...cfg, lives: cfg.lives, max: cfg.lives, comeback_due: 0, blinds: [], rounds: [], result: null, tlost: 0, hlost: 0 };
  G.GAME.pvp = P;
  G.GAME.win_ante = 999;
  const rb = RULESET_BANS[P.ruleset] || RULESET_BANS.vanilla;
  for (const k of [...pvpBannedKeys(P.mode, P.ruleset), ...rb.silent]) G.GAME.banned_keys[k] = true;
  if (P.ruleset !== 'vanilla') Object.assign(P_CENTERS.m_glass.config, GLASS_BALANCED);
  if (P.ruleset === 'expanded') setupExpanded(P);
}
/** newRun: the mods a PvP run activates (+ the internal ones of its ruleset) and its forced options. */
export function pvpMods(ids, options, cfg, run) {
  const opts = { ...(options || {}) };
  for (const [m, o] of Object.entries(PVP_FORCED_OPTIONS)) if ((ids || []).includes(m)) opts[m] = { ...(opts[m] || {}), ...o };
  // (stage 7c: the Multiplayer decks / stakes' mod only when the match plays one — every other match is as before)
  const mpDeck = !!(run && (MP_BACKS.includes(run.back) || MP_STAKES.includes(run.stake)));
  return { ids: [...(ids || []), PVP_ID, ...(RULESET_MODS[(cfg && cfg.ruleset) || 'vanilla'] || []), ...(mpDeck ? [DECKS_ID] : [])], options: opts };
}

/** A life lost (a failed blind, a lost Nemesis round): comeback money is due at the next cash-out. */
function loseLife(n = 1) {
  const P = G.GAME.pvp;
  P.lives = Math.max(0, P.lives - n);
  if (P.comeback) P.comeback_due = 1;
  emit('pvp_lives', { lives: P.lives, lost: n });
}

/**
 * end_round: the blind was NOT beaten. A PvP run never ends here: the Nemesis has no target (it can't fail), and a
 * normal blind counts as passed but costs a life. Returns true (the run goes on). `slot`: 'Small' | 'Big' | 'Boss'.
 */
export function pvpRoundLost(slot) {
  const P = G.GAME.pvp;
  // (a PvP round under its target — a real boss with Boss Blind effects on — still counts as played: its reward is paid)
  if (G.GAME.pvp_blind) { G.GAME.pvp_failed = true; return true; }
  P.blinds.push({ ante: G.GAME.round_resets.ante, slot, r: 'fail' });
  G.GAME.pvp_failed = true;
  if (P.deathOnLoss) loseLife(1);
  emit('pvp_blind', { ante: G.GAME.round_resets.ante, slot, result: 'fail' });
  return true;
}
/** end_round: a normal blind was beaten (logged for the referee: a pending death asks whether you beat that blind). */
export function pvpRoundWon(slot) {
  if (G.GAME.pvp_blind) return;
  G.GAME.pvp.blinds.push({ ante: G.GAME.round_resets.ante, slot, r: 'beat' });
  emit('pvp_blind', { ante: G.GAME.round_resets.ante, slot, result: 'beat' });
}
/** skip_blind: a skip counts as beaten for the referee. */
export function pvpSkipped(slot) {
  G.GAME.pvp.blinds.push({ ante: G.GAME.round_resets.ante, slot, r: 'skip' });
  if (G.GAME.pvp.ruleset === 'expanded') expandedSkipped();
}

/** The cash-out's PvP rows: the comeback money (once, after a life was lost). */
function evaluateRows() {
  const P = G.GAME.pvp;
  const rows = [];
  if (P && P.comeback_due) {
    P.comeback_due = 0;
    rows.push({ name: 'pvp_comeback', dollars: G.GAME.stake >= 6 ? 2 : 4, bonus: true, disp: P.max - P.lives });
  }
  return rows;
}

/** Is a PvP action legal now? -> null or the reason it isn't. */
export function pvpActionError(a, S, STATES) {
  if (!isPvp()) return 'not a multiplayer run';
  const P = G.GAME.pvp;
  if (a.type === 'pvp_end') return ['win', 'lose', 'draw'].includes(a.result) ? null : 'bad result';
  // (the Hurry timer's life: the referee's count, applied in order — whatever the run is doing)
  if (a.type === 'pvp_timer') return a.n === (P.tlost || 0) + 1 ? null : 'not the next timer loss';
  // (the PvP timer's hand: the referee's count, applied in order; it only takes a hand inside a Nemesis round)
  if (a.type === 'pvp_hand_lost') return a.n === (P.hlost || 0) + 1 ? null : 'not the next hand lost';
  // (Expanded: the opponent's state and the effects relayed to this player — legal whatever the run is doing)
  if (a.type === 'pvp_opp' || a.type === 'pvp_fx') return expandedActionError(a);
  if (P.lives <= 0) return 'out of lives';
  if (a.type === 'pvp_start_blind') {
    if (S !== STATES.BLIND_SELECT) return 'not choosing a blind';
    const on = G.GAME.blind_on_deck;
    if (!pvpSlot(on) || G.GAME.round_resets.blind_states[on] !== 'Select') return 'the Nemesis is not up';
    return null;
  }
  if (a.type === 'pvp_outcome') {
    if (!G.GAME.pvp_blind) return 'not in a Nemesis round';
    if (S !== STATES.SELECTING_HAND && S !== STATES.PVP_WAIT) return 'busy';
    if (!['win', 'lose', 'tie'].includes(a.result)) return 'bad result';
    if (!(Number.isInteger(a.lives) && a.lives >= 0 && a.lives <= 99)) return 'bad lives';
    return null;
  }
  return 'unknown action ' + a.type;
}
/** Apply a (legal) PvP action. `selectBlind(which)` is run.js's select_blind. */
export function pvpApply(a, STATES, selectBlind) {
  const P = G.GAME.pvp;
  if (a.type === 'pvp_start_blind') {
    G.GAME.pvp_blind = true;
    if (P.ruleset === 'expanded') expandedStartBlind();
    emit('pvp_start', { ante: G.GAME.round_resets.ante, slot: G.GAME.blind_on_deck });
    selectBlind(G.GAME.blind_on_deck);
    return;
  }
  if (a.type === 'pvp_opp' || a.type === 'pvp_fx') { expandedApply(a); return; }
  if (a.type === 'pvp_hand_lost') {
    P.hlost = (P.hlost || 0) + 1;
    if (G.GAME.pvp_blind && G.GAME.current_round.hands_left > 0) {
      ease_hands_played(-1, true);
      emit('pvp_hand_lost', { n: P.hlost, hands: G.GAME.current_round.hands_left });
      if (G.GAME.current_round.hands_left < 1 && G.STATE === STATES.SELECTING_HAND) { G.hand.unhighlight_all(); G.STATE = STATES.PVP_WAIT; G.STATE_COMPLETE = false; }
    }
    return;
  }
  if (a.type === 'pvp_timer') {
    P.tlost = (P.tlost || 0) + 1;
    if (P.lives > 0) loseLife(1);
    emit('pvp_timer', { n: P.tlost, lives: P.lives });
    return;
  }
  if (a.type === 'pvp_outcome') {
    const before = P.lives;
    P.rounds.push({ ante: G.GAME.round_resets.ante, result: a.result });
    P.lives = a.lives;
    if (a.result === 'lose' && P.comeback) P.comeback_due = 1;
    if (a.lives !== before) emit('pvp_lives', { lives: a.lives, lost: before - a.lives });
    emit('pvp_outcome', { result: a.result, lives: a.lives });
    G.hand.unhighlight_all();
    G.STATE = STATES.NEW_ROUND;
    G.STATE_COMPLETE = false;
    return;
  }
  if (a.type === 'pvp_end') {
    P.result = a.result;
    G.GAME.won = a.result === 'win';
    G.STATE = STATES.GAME_OVER;
    G.STATE_COMPLETE = false;
  }
}
/** The view's PvP part (the HUD: lives, the Nemesis state; the client's referee bookkeeping: the blind log). */
export function pvpView(v) {
  const P = G.GAME && G.GAME.pvp;
  if (!P) return;
  v.pvp = {
    lives: P.lives, max: P.max, pvpStart: P.pvpStart, deathOnLoss: P.deathOnLoss, comeback: P.comeback,
    mode: P.mode || 'attrition', showdownStart: P.showdownStart || 3, bossFx: !!P.bossFx, tlost: P.tlost || 0,
    ruleset: P.ruleset || 'vanilla', order: !!P.order, hlost: P.hlost || 0,
    // (this ante's PvP slots — the blind select's READY columns — and the slot being played)
    slots: pvpSlots(P, G.GAME.round_resets.ante), slot: G.GAME.pvp_blind ? G.GAME.blind_on_deck : null,
    nemesis: !!G.GAME.pvp_blind, blinds: P.blinds.slice(), rounds: P.rounds.slice(), result: P.result,
    hands_played: G.GAME.pvp_blind ? G.GAME.current_round.hands_played : 0,
  };
  if (P.ruleset === 'expanded') expandedView(v.pvp);
}

const HOOKS = {
  // the ante's PvP slots become the Nemesis (rolled after the normal boss, so every RNG stream is as in solo); with Boss
  // Blind effects on, a PvP Boss keeps the boss the shared seed rolled (pvpSlots says it is a PvP round)
  new_boss_choice() {
    const rr = G.GAME.round_resets, sl = pvpSlots(G.GAME.pvp, rr.ante);
    if (sl.Boss && !G.GAME.pvp.bossFx) rr.blind_choices.Boss = NEMESIS;
    if (G.GAME.pvp.mode === 'showdown') { rr.blind_choices.Small = sl.Small ? NEMESIS : 'bl_small'; rr.blind_choices.Big = sl.Big ? NEMESIS : 'bl_big'; }
  },
  boss_eligible(ok, blind) { return blind && blind.key === NEMESIS ? false : undefined; },
  // (Showdown) a Nemesis in the Small / Big slot IS that slot: Defeated there, no ante step, not a boss
  blind_slot() { return G.GAME.pvp_blind && G.GAME.blind_on_deck !== 'Boss' ? G.GAME.blind_on_deck : undefined; },
  new_round() {
    const on = G.GAME.blind_on_deck;
    if (!G.GAME.pvp_blind || on === 'Boss') return;
    const rr = G.GAME.round_resets;
    rr.blind_states.Boss = 'Upcoming'; rr.blind_states[on] = 'Current';
    G.GAME.blind.boss = false; G.GAME.current_boss_streak = 0;
    G.GAME.subhash = rr.ante + (on === 'Small' ? 'S' : 'B');
  },
  // a PvP round is never skipped (both players play it together)
  can_skip_blind() { return pvpSlot(G.GAME.blind_on_deck) ? false : undefined; },
  // a PvP round pays its reward, never the unused hands (end_round sets pvp_eval for this cash-out)
  evaluate_round_pre() {
    if (!G.GAME.pvp_eval) return undefined;
    const was = G.GAME.modifiers.no_extra_hand_money;
    G.GAME.modifiers.no_extra_hand_money = true;
    return () => { G.GAME.modifiers.no_extra_hand_money = was; G.GAME.pvp_eval = undefined; };
  },
  evaluate_round() { return evaluateRows(); },
  view(v) { pvpView(v); },
};

registerMod({
  id: PVP_ID,
  name: 'Multiplayer',
  hidden: true, // engine-internal: never listed, never in G.GAME.mods
  hooks: HOOKS,
  content: {
    atlases: { mtpvp_blind: { src: '/micatro/assets/textures/pvp/NemesisChip.png', px: 34, py: 34, frames: 21 } },
    blinds: [{
      key: NEMESIS, name: 'Your Nemesis', atlas: 'mtpvp_blind', pos: { x: 0, y: 0 }, dollars: 5, mult: 0,
      boss: { min: 1, max: 10 }, boss_colour: '#8f3550', debuff: {}, vars: {},
      in_pool: () => false,
    }],
    loc: { descriptions: { Blind: { [NEMESIS]: { name: 'Your Nemesis', text: ['Face your opponent:', 'most chips wins'] } } } },
  },
});

// ------------------------------------------------------------------ Balanced (stage 7): the reworked jokers
// Both keep the vanilla art (the base Jokers sheet) and replace the vanilla card in the pools (RULESET_BANS.silent).
const BAL_BADGE = { text: 'Balanced', colour: '#ac3232' };
registerMod({
  id: 'pvp_balanced',
  name: 'Multiplayer: Balanced',
  hidden: true,
  content: {
    atlases: { mtpvp_vjokers: { src: '/micatro/assets/textures/Jokers.png', px: 71, py: 95 } },
    centers: [
      {
        // Hanging Chad (Balanced): the first AND second scoring cards retrigger once each (vanilla: the first, twice)
        key: 'j_mp_hanging_chad', set: 'Joker', name: 'MP Hanging Chad', rarity: 1, cost: 4, order: 115.5,
        blueprint_compat: true, eternal_compat: true, perishable_compat: true,
        config: { extra: 1 }, atlas: 'mtpvp_vjokers', pos: { ...P_CENTERS.j_hanging_chad.pos },
        loc_vars: (center, iq, card) => ({ vars: [card ? card.ability.extra : 1] }),
        calculate(center, card, ctx) {
          if (ctx.repetition && ctx.cardarea === G.play && ctx.scoring_hand && (ctx.other_card === ctx.scoring_hand[0] || ctx.other_card === ctx.scoring_hand[1])) {
            return { message: localize('k_again_ex'), repetitions: card.ability.extra, card };
          }
          return undefined;
        },
      },
      {
        // Bloodstone (Balanced): the same odds and X1.5 — but in a PvP round its rolls come from a queue kept per round:
        // the nth scored Heart of every hand reads the round's nth roll, so both players (same seed) get the same rolls
        key: 'j_mp_bloodstone', set: 'Joker', name: 'MP Bloodstone', rarity: 2, cost: 7, order: 117.5,
        blueprint_compat: true, eternal_compat: true, perishable_compat: true,
        config: { extra: { odds: 2, Xmult: 1.5 } }, atlas: 'mtpvp_vjokers', pos: { ...P_CENTERS.j_bloodstone.pos },
        loc_vars: (center, iq, card) => {
          const e = card ? card.ability.extra : center.config.extra;
          const [n, d] = card ? probability_vars(card, 1, e.odds, 'bloodstone') : [(G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1), e.odds];
          return { vars: [n, d, e.Xmult] };
        },
        calculate(center, card, ctx) {
          const e = card.ability.extra;
          if (ctx.before && !ctx.blueprint) card.ability.mp_bsindex = 0;
          if (!(ctx.individual && ctx.cardarea === G.play && ctx.other_card && ctx.other_card.is_suit('Hearts'))) return undefined;
          let hit;
          if (G.GAME.pvp_blind) {
            const key = String(order_round_based(true));
            const rr = G.GAME.round_resets;
            const q = ((rr.mp_bloodstone = rr.mp_bloodstone || {})[key] = rr.mp_bloodstone[key] || []);
            const i = card.ability.mp_bsindex = (card.ability.mp_bsindex || 0) + 1;
            if (q[i - 1] === undefined) q[i - 1] = pseudorandom('bloodstone' + key);
            const [n, d] = probability_vars(card, 1, e.odds, 'bloodstone', true);
            hit = q[i - 1] < n / d;
          } else hit = probability_roll(card, 'bloodstone', 1, e.odds);
          return hit ? { x_mult: e.Xmult, card } : undefined;
        },
      },
    ],
    loc: { descriptions: { Joker: {
      j_mp_hanging_chad: { name: 'Hanging Chad', text: ['Retrigger {C:attention}first{} and {C:attention}second{}', 'played cards used in scoring', '{C:attention}#1#{} additional time'] },
      j_mp_bloodstone: { name: 'Bloodstone', text: ['{C:green}#1# in #2#{} chance for', 'played cards with', '{C:hearts}Heart{} suit to give', '{X:mult,C:white} X#3# {} Mult when scored'] },
    } } },
  },
  hooks: {
    // (the reworked cards wear the mod's "Balanced" badge)
    describe(card, desc) {
      const k = card && card.config && card.config.center && card.config.center.key;
      if (desc && Array.isArray(desc.badges) && (k === 'j_mp_hanging_chad' || k === 'j_mp_bloodstone' || k === 'm_glass')) desc.badges.push(BAL_BADGE);
    },
  },
});

