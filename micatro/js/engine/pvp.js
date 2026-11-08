// Micatro Multiplayer (PvP) — the engine's rules for a 2-player match: the Balatro Multiplayer mod's "Vanilla" ruleset,
// Attrition mode (re-implemented from its behaviour; see server/micatro_pvp.mjs for the referee).
//
//   newRun({..., pvp: {lives, pvpStart, deathOnLoss, comeback}})   -> a PvP run (session.js records `recipe.pvp`)
//
// An internal mod ('pvp', hidden, never in G.GAME.mods — like the 'challenge' one), active only in a PvP run, so a
// solo run is untouched (no hook, no state, no RNG). What it does:
//   * from ante `pvpStart` every Boss Blind is "Your Nemesis" (bl_mp_nemesis): no score target (its chips are 0), you
//     play ALL your hands (HAND_PLAYED -> DRAW_TO_HAND, never "beaten"); out of hands -> the PVP_WAIT state until the
//     referee's result. It pays $5, never the unused-hands money. Boss rerolls / disables never touch it.
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
/** Every banned key (for the lobby screen's list and the tests). */
export const pvpBannedKeys = () => [...ATTRITION_BANS, ...Object.values(PVP_MOD_BANS).flat()];

/** A PvP config, validated (the lobby's options; anything else in it is dropped so the recipe stays canonical). */
export function pvpConfig(c) {
  if (!c || typeof c !== 'object') return null;
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return { v: PVP_RULES, lives: int(c.lives, 1, 9, 4), pvpStart: int(c.pvpStart, 1, 8, 2), deathOnLoss: c.deathOnLoss !== false, comeback: c.comeback !== false };
}

/** Is this run a PvP run? */
export const isPvp = () => !!(G.GAME && G.GAME.pvp);
/** Is the blind being played the Nemesis? */
export const inNemesis = () => !!(G.GAME && G.GAME.pvp && G.GAME.pvp_blind);
/** The ante's Boss is the Nemesis (from pvpStart). */
const nemesisAnte = (ante) => isPvp() && ante >= G.GAME.pvp.pvpStart;

/** newRun: the run's PvP state, its bans and win_ante (after init_game_object + the mods' hooks, before the boss roll). */
export function setupPvp(cfg) {
  const P = { ...cfg, lives: cfg.lives, max: cfg.lives, comeback_due: 0, blinds: [], rounds: [], result: null };
  G.GAME.pvp = P;
  G.GAME.win_ante = 999;
  for (const k of pvpBannedKeys()) G.GAME.banned_keys[k] = true;
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
  if (G.GAME.pvp_blind) return true;
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
  if (P.lives <= 0) return 'out of lives';
  if (a.type === 'pvp_start_blind') {
    if (S !== STATES.BLIND_SELECT) return 'not choosing a blind';
    const on = G.GAME.blind_on_deck;
    if (on !== 'Boss' || G.GAME.round_resets.blind_choices.Boss !== NEMESIS || G.GAME.round_resets.blind_states.Boss !== 'Select') return 'the Nemesis is not up';
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
    emit('pvp_start', { ante: G.GAME.round_resets.ante });
    selectBlind('Boss');
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
    nemesis: !!G.GAME.pvp_blind, blinds: P.blinds.slice(), rounds: P.rounds.slice(), result: P.result,
    hands_played: G.GAME.pvp_blind ? G.GAME.current_round.hands_played : 0,
  };
}

const HOOKS = {
  // the ante's Boss is the Nemesis from pvpStart (rolled after the normal boss, so every RNG stream is as in solo)
  new_boss_choice() {
    if (nemesisAnte(G.GAME.round_resets.ante)) G.GAME.round_resets.blind_choices.Boss = NEMESIS;
  },
  boss_eligible(ok, blind) { return blind && blind.key === NEMESIS ? false : undefined; },
  // the Nemesis pays its reward, never the unused hands
  evaluate_round_pre() {
    const b = G.GAME.blind && G.GAME.blind.config && G.GAME.blind.config.blind;
    if (!b || b.key !== NEMESIS) return undefined;
    const was = G.GAME.modifiers.no_extra_hand_money;
    G.GAME.modifiers.no_extra_hand_money = true;
    return () => { G.GAME.modifiers.no_extra_hand_money = was; };
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

