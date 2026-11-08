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
import { G, emit } from './core.js';
import { registerMod } from '../mods/registry.js';

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
/** Every banned key of a mode (for the lobby screen's list and the tests). */
export const pvpBannedKeys = (mode = 'attrition') => [...(mode === 'survival' ? SURVIVAL_BANS : ATTRITION_BANS), ...Object.values(PVP_MOD_BANS).flat()];

/** A PvP config, validated (the lobby's options; anything else in it is dropped so the recipe stays canonical). */
export function pvpConfig(c) {
  if (!c || typeof c !== 'object') return null;
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  const mode = MODES.includes(c.mode) ? c.mode : 'attrition';
  const out = {
    v: PVP_RULES, lives: int(c.lives, 1, 9, 4), pvpStart: int(c.pvpStart, 1, 8, 2), deathOnLoss: c.deathOnLoss !== false, comeback: c.comeback !== false,
    mode, showdownStart: int(c.showdownStart, 1, 20, 3), bossFx: c.bossFx === true,
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

/** newRun: the run's PvP state, its bans and win_ante (after init_game_object + the mods' hooks, before the boss roll). */
export function setupPvp(cfg) {
  const P = { ...cfg, lives: cfg.lives, max: cfg.lives, comeback_due: 0, blinds: [], rounds: [], result: null, tlost: 0 };
  G.GAME.pvp = P;
  G.GAME.win_ante = 999;
  for (const k of pvpBannedKeys(P.mode)) G.GAME.banned_keys[k] = true;
}
/** newRun: the mods a PvP run activates (+ the internal one) and its forced options. */
export function pvpMods(ids, options) {
  const opts = { ...(options || {}) };
  for (const [m, o] of Object.entries(PVP_FORCED_OPTIONS)) if ((ids || []).includes(m)) opts[m] = { ...(opts[m] || {}), ...o };
  return { ids: [...(ids || []), PVP_ID], options: opts };
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
    emit('pvp_start', { ante: G.GAME.round_resets.ante, slot: G.GAME.blind_on_deck });
    selectBlind(G.GAME.blind_on_deck);
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
    // (this ante's PvP slots — the blind select's READY columns — and the slot being played)
    slots: pvpSlots(P, G.GAME.round_resets.ante), slot: G.GAME.pvp_blind ? G.GAME.blind_on_deck : null,
    nemesis: !!G.GAME.pvp_blind, blinds: P.blinds.slice(), rounds: P.rounds.slice(), result: P.result,
    hands_played: G.GAME.pvp_blind ? G.GAME.current_round.hands_played : 0,
  };
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

