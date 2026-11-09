// Micatro Multiplayer (PvP): the in-run HUD, drawn from the VIEW alone, so the player and anyone watching them see the same.
//   view.pvp      the engine's part (engine/pvp.js pvpView): this player's lives, the mode, this ante's PvP slots, whether a
//                 PvP round is being played
//   view.pvp_opp  the match's part (ui/pvp.js decorates the player's view, and it is published to spectators):
//                 {name, lives, max, me, myLives, loc, score, hidden, hands, ready, meReady, countdown, banner, mode,
//                  far, myFar, timer: {onMe, left, paused, mine} | null, canHurry}
// Board calls renderPvpHud(board, view) on every HUD render; nemesisPanel / nemesisChoice override the blind panel and the
// blind-select column of a PvP round (no score target: the opponent's live score instead; READY instead of Select).
import { fmt, esc } from './markup.js';

export const NEMESIS = 'bl_mp_nemesis';
const LOC_TEXT = { select: 'Choosing a blind', shop: 'Shopping', ready: 'Ready for the Nemesis', playing: 'Playing', nemesis: 'Playing the Nemesis', pack: 'Opening a pack', wait: 'Out of hands', cashout: 'Cashing out', over: 'Finished' };
const hearts = (n, max) => {
  n = Math.max(0, n | 0); max = Math.max(n, max | 0);
  return max > 6 ? `<span class="ph-h">♥</span>${n}` : '<span class="ph-h">' + '♥'.repeat(n) + '</span><span class="ph-h0">' + '♥'.repeat(max - n) + '</span>';
};
/** A blind number (ante*10 + 1|2|3) in words: 'Ante 3 Big'. */
export const blindText = (b) => (b > 0 ? `Ante ${Math.floor(b / 10)} ${['', 'Small', 'Big', 'Boss'][b % 10] || ''}`.trim() : 'none yet');
/** Seconds as m:ss (one decimal under 10 s, as the mod's timer). */
export const clockText = (s) => (s < 9.95 ? Math.max(0, s).toFixed(1) : `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`);

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
    el.innerHTML = '<div class="ph-row"><div class="ph-me"></div><div class="ph-vs">vs</div><div class="ph-opp"></div></div><div class="ph-loc"></div><div class="ph-timer" style="display:none"></div><div class="ph-timer ph-ptimer" style="display:none"></div><div class="ph-banner" hidden></div>';
    (board && board.stage ? board.stage : document.body).appendChild(el);
  }
  el.hidden = false;
  const o = v.pvp_opp || {};
  const survival = v.pvp.mode === 'survival';
  const meLives = o.myLives != null ? o.myLives : v.pvp.lives;
  // (Survival: one life each, so no hearts — the furthest blind each has beaten instead)
  el.querySelector('.ph-me').innerHTML = `<span class="ph-name">${esc(o.me || 'You')}</span> ` + (survival ? `<span class="ph-far">${blindText(o.myFar)}</span>` : hearts(meLives, v.pvp.max));
  el.querySelector('.ph-opp').innerHTML = o.name ? `<span class="ph-name">${esc(o.name)}</span> ` + (survival ? `<span class="ph-far">${blindText(o.far)}</span>` : hearts(o.lives, o.max || v.pvp.max)) : '<span class="muted">waiting…</span>';
  let loc = locText(o);
  if (v.pvp.nemesis && (o.score != null || o.hidden)) loc = `Their score <b>${o.hidden ? '???' : fmt(o.score)}</b> · ${o.hands == null ? '…' : o.hands} hand${o.hands === 1 ? '' : 's'} left`;
  if (v.state === 'PVP_WAIT') loc = `Out of hands — waiting for ${esc(o.name || 'your Nemesis')} to finish…`;
  el.querySelector('.ph-loc').innerHTML = loc;
  // the Hurry timer: the countdown on whoever is timed; the READY player's Hurry / Pause button
  const tm = el.querySelector('.ph-timer');
  const t = o.timer;
  const showBtn = !board.readOnly && (o.canHurry || (t && t.mine));
  tm.style.display = !t && !showBtn ? 'none' : ''; // (style, not [hidden]: .ph-timer is a flex row)
  tm.classList.toggle('on-me', !!(t && t.onMe));
  // (the clock redraws 4x a second: the text and the button are updated in place, so a click is never lost to a redraw)
  let span = tm.querySelector('.ph-clock'), b = tm.querySelector('.b-pvp-hurry');
  if (!span) { span = document.createElement('span'); span.className = 'ph-clock'; tm.appendChild(span); }
  span.style.display = t ? '' : 'none';
  span.textContent = !t ? '' : t.onMe ? `Hurry! ${clockText(t.left)}${t.paused ? ' (paused)' : ''} — or lose a life` : `${o.name || 'Your Nemesis'}'s timer ${clockText(t.left)}${t.paused ? ' (paused)' : ''}`;
  if (showBtn && !b) {
    b = document.createElement('button');
    b.type = 'button';
    b.title = 'Start a timer on your opponent: at 0 they lose a life';
    b.addEventListener('click', () => board.onPvpHurry && board.onPvpHurry());
    tm.appendChild(b);
  }
  if (b) {
    b.style.display = showBtn ? '' : 'none';
    const running = !!(t && t.mine && !t.paused);
    const cls = 'btn ' + (running ? 'grey' : 'red') + ' b-pvp-hurry', label = running ? 'Pause timer' : 'Hurry!';
    if (b.className !== cls) b.className = cls;
    if (b.textContent !== label) b.textContent = label;
  }
  // the PvP timer (stage 7, a Nemesis round): the clock on whoever it runs on; the leader's start / stop button
  const pm = el.querySelector('.ph-ptimer');
  const pt = v.pvp.nemesis ? o.pvpt : null;
  const pBtn = !board.readOnly && v.pvp.nemesis && (o.canPvpTimer || (pt && pt.mine));
  pm.style.display = !pt && !pBtn ? 'none' : '';
  pm.classList.toggle('on-me', !!(pt && pt.onMe));
  let pspan = pm.querySelector('.ph-clock'), pb = pm.querySelector('.b-pvp-ptimer');
  if (!pspan) { pspan = document.createElement('span'); pspan.className = 'ph-clock'; pm.appendChild(pspan); }
  pspan.style.display = pt ? '' : 'none';
  pspan.textContent = !pt ? '' : pt.onMe ? `PvP timer ${clockText(pt.left)} — play, or lose a hand` : `${o.name || 'Your Nemesis'}'s PvP timer ${clockText(pt.left)}`;
  if (pBtn && !pb) {
    pb = document.createElement('button');
    pb.type = 'button';
    pb.title = 'You are ahead: start a clock on your opponent — at 0 they lose a hand';
    pb.addEventListener('click', () => board.onPvpTimer && board.onPvpTimer());
    pm.appendChild(pb);
  }
  if (pb) {
    pb.style.display = pBtn ? '' : 'none';
    const cls = 'btn ' + (pt && pt.mine ? 'grey' : 'red') + ' b-pvp-ptimer', label = pt && pt.mine ? 'Stop timer' : 'Start timer';
    if (pb.className !== cls) pb.className = cls;
    if (pb.textContent !== label) pb.textContent = label;
  }
  const bn = el.querySelector('.ph-banner');
  bn.hidden = !o.banner;
  bn.innerHTML = o.banner ? o.banner : '';
  el.classList.toggle('ph-nemesis', !!v.pvp.nemesis);
}

/** The blind panel while playing a PvP round: {name, label, target, rewardLabel, reward} or null. */
export function nemesisPanel(b, v) {
  if (!b || !v || !v.pvp || !(b.key === NEMESIS || v.pvp.nemesis)) return null;
  const o = v.pvp_opp || {};
  // (a real boss — Boss Blind effects on — keeps its own name: its effect is in play)
  const name = b.key === NEMESIS ? 'Your Nemesis: ' + (o.name || '…') : null;
  // (the round over — cashing out — the panel just names the Nemesis)
  if (!v.pvp.nemesis) return { name, label: 'Most chips wins', target: '—', rewardLabel: 'Reward: ', reward: '$$$$$' };
  return { name, label: 'Their score', target: o.hidden || o.score == null ? '???' : fmt(o.score), rewardLabel: 'Hands left: ', reward: o.hands == null ? '…' : String(o.hands) };
}
/** A PvP round's column on the blind select (any slot in Showdown): {label, active, req, value, reward} or null. */
export function nemesisChoice(c, v, slot = 'Boss') {
  if (!c || !v || !v.pvp) return null;
  const pvpSlot = v.pvp.slots ? !!v.pvp.slots[slot] : c.key === NEMESIS;
  if (!pvpSlot) return null;
  const o = v.pvp_opp || {};
  const label = o.countdown ? String(o.countdown) : o.meReady ? (o.ready ? 'Starting…' : 'Waiting…') : 'READY';
  // (a real boss flagged PvP: the mod's "Most chips wins")
  return { label, active: !!o.meReady, req: c.key === NEMESIS ? 'The stakes' : 'Most chips wins', value: 'Life or Death', reward: o.name ? `vs <b>${esc(o.name)}</b>${o.ready ? ' · ready' : ''}` : '' };
}
