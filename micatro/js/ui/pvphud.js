// Micatro Multiplayer (PvP): the in-run HUD, drawn from the VIEW alone, so the player and anyone watching them see the same.
//   view.pvp      the engine's part (engine/pvp.js pvpView): this player's lives, whether the Nemesis is being played
//   view.pvp_opp  the match's part (ui/pvp.js decorates the player's view, and it is published to spectators):
//                 {name, lives, max, me, myLives, loc, score, hands, ready, meReady, countdown, banner, wait}
// Board calls renderPvpHud(board, view) on every HUD render; nemesisPanel / nemesisChoice override the blind panel and the
// blind-select column of "Your Nemesis" (no score target: the opponent's live score instead; READY instead of Select).
import { fmt, esc } from './markup.js';

export const NEMESIS = 'bl_mp_nemesis';
const LOC_TEXT = { select: 'Choosing a blind', shop: 'Shopping', ready: 'Ready for the Nemesis', playing: 'Playing', nemesis: 'Playing the Nemesis', pack: 'Opening a pack', wait: 'Out of hands', cashout: 'Cashing out', over: 'Finished' };
const hearts = (n, max) => {
  n = Math.max(0, n | 0); max = Math.max(n, max | 0);
  return max > 6 ? `<span class="ph-h">♥</span>${n}` : '<span class="ph-h">' + '♥'.repeat(n) + '</span><span class="ph-h0">' + '♥'.repeat(max - n) + '</span>';
};

/** The opponent's location, in words ('Shopping · Ante 3'). */
export function locText(o) {
  if (!o || !o.loc) return '';
  return (LOC_TEXT[o.loc] || o.loc) + (o.ante ? ' · Ante ' + o.ante : '');
}

export function renderPvpHud(board, v) {
  let el = document.getElementById('pvp-hud');
  if (!v || !v.pvp) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'pvp-hud';
    el.className = 'pvp-hud';
    el.innerHTML = '<div class="ph-row"><div class="ph-me"></div><div class="ph-vs">vs</div><div class="ph-opp"></div></div><div class="ph-loc"></div><div class="ph-banner" hidden></div>';
    (board && board.stage ? board.stage : document.body).appendChild(el);
  }
  el.hidden = false;
  const o = v.pvp_opp || {};
  const meLives = o.myLives != null ? o.myLives : v.pvp.lives;
  el.querySelector('.ph-me').innerHTML = `<span class="ph-name">${esc(o.me || 'You')}</span> ${hearts(meLives, v.pvp.max)}`;
  el.querySelector('.ph-opp').innerHTML = o.name ? `<span class="ph-name">${esc(o.name)}</span> ${hearts(o.lives, o.max || v.pvp.max)}` : '<span class="muted">waiting…</span>';
  let loc = locText(o);
  if (v.pvp.nemesis && o.score != null) loc = `Their score <b>${fmt(o.score)}</b> · ${o.hands == null ? '…' : o.hands} hand${o.hands === 1 ? '' : 's'} left`;
  if (v.state === 'PVP_WAIT') loc = `Out of hands — waiting for ${esc(o.name || 'your Nemesis')} to finish…`;
  el.querySelector('.ph-loc').innerHTML = loc;
  const b = el.querySelector('.ph-banner');
  b.hidden = !o.banner;
  b.innerHTML = o.banner ? o.banner : '';
  el.classList.toggle('ph-nemesis', !!v.pvp.nemesis);
}

/** The blind panel while playing the Nemesis: {name, target, reward} or null. */
export function nemesisPanel(b, v) {
  if (!b || b.key !== NEMESIS || !v || !v.pvp) return null;
  const o = v.pvp_opp || {};
  // (the round over — cashing out — the panel just names the Nemesis)
  if (!v.pvp.nemesis) return { name: 'Your Nemesis: ' + (o.name || '…'), label: 'Most chips wins', target: '—', rewardLabel: 'Reward: ', reward: '$$$$$' };
  return { name: 'Your Nemesis: ' + (o.name || '…'), label: 'Their score', target: o.score == null ? '???' : fmt(o.score), rewardLabel: 'Hands left: ', reward: o.hands == null ? '…' : String(o.hands) };
}
/** The Nemesis column on the blind select: {button label, disabled, req label/value, reward} or null. */
export function nemesisChoice(c, v) {
  if (!c || c.key !== NEMESIS || !v || !v.pvp) return null;
  const o = v.pvp_opp || {};
  const label = o.countdown ? String(o.countdown) : o.meReady ? (o.ready ? 'Starting…' : 'Waiting…') : 'READY';
  return { label, active: !!o.meReady, req: 'The stakes', value: 'Life or Death', reward: o.name ? `vs <b>${esc(o.name)}</b>${o.ready ? ' · ready' : ''}` : '' };
}
