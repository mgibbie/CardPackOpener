// pad.js — controller play for Micatro (site/gamepad.js core, Nintendo layout:
// right face = confirm, bottom face = cancel). Signed-in players only; a
// signed-out player's pad just says how to enable it.
//
// A focus reticle moves between every card and button on the table (or the
// open modal) with the d-pad / left stick — the same spatial scoring as
// battlecards/padnav.js. Buttons:
//   confirm   hand card: toggle selection · shop item: buy · pack card: take it
//             owned joker/consumable: select it (again = use a consumable) · button: press
//             HOLD confirm + ←/→ on a hand card / joker / consumable: move it
//   secondary owned card: sell · shop consumable: buy & use · otherwise: sort hand (rank ⇄ suit)
//   context   card info (tooltip) on/off
//   LB / RB   the screen's two main buttons: Play Hand / Discard, Select / Skip blind,
//             Next Round / Reroll, Cash Out, Skip pack
//   cancel    close a dialog · deselect
//   Start     pause menu (options, speed, run info, deck, quit)   Select  deck view
// The reticle hides when the mouse moves or the pad disconnects.
import { startGamepad, buttonLabel, loadPadSettings, rumble } from '/site/gamepad.js';

const CARD_AREAS = ['hand', 'jokers', 'consumeables', 'shop_jokers', 'shop_vouchers', 'shop_booster', 'pack_cards'];
const REORDER = ['hand', 'jokers', 'consumeables'];
const PACK = /_PACK$/;
const DOM_SEL = 'button:not(:disabled), a[href], input, .deck-pile, .tag-ico, [data-pad]';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const padSignedIn = () => {
  try { return !!localStorage.getItem('magepunk_mp_token_v1') && !!(JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null') || {}).username; }
  catch (e) { return false; }
};
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const onScreen = (r) => r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 4 && r.height > 4;

export function initPad({ board, stage, UI, readOnly, onMenu, mainMenu }) {
  let focus = null;            // {card:id} | {el}
  let ringOn = false, tipsOn = false, hold = null, lastState = null, lastModal = null, kind = 'generic';
  const signed = padSignedIn();

  const reticle = document.createElement('div'); reticle.className = 'pad-reticle'; reticle.style.display = 'none';
  stage.appendChild(reticle);
  const hints = document.createElement('div'); hints.id = 'pad-hints'; hints.style.display = 'none';
  document.body.appendChild(hints);

  const view = () => board.view;
  const topModal = () => { const m = stage.querySelectorAll('.modal-layer .modal'); return m.length ? m[m.length - 1] : null; };

  // ------------------------------------------------------------- stops
  function shownEl(el, anywhere) {
    if (el.closest('.card-btns') || el.closest('.card')) return false;
    const r = el.getBoundingClientRect();
    if (anywhere ? (r.width < 4 || r.height < 4) : !onScreen(r)) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none';
  }
  function stops() {
    const modal = topModal();
    // a modal may still be sliding in: its stops count even while off screen
    if (modal) return [...modal.querySelectorAll(DOM_SEL)].filter((el) => shownEl(el, true)).map((el) => ({ el, r: el.getBoundingClientRect() }));
    const out = [];
    for (const k of CARD_AREAS) for (const id of board.areas[k]) {
      const s = board.sprites.get(id);
      if (!s || s.leaving) continue;
      const r = s.el.getBoundingClientRect();
      if (onScreen(r)) out.push({ card: id, r });
    }
    for (const el of stage.querySelectorAll(DOM_SEL)) {
      if (el.closest('.modal-layer') || !shownEl(el)) continue;
      out.push({ el, r: el.getBoundingClientRect() });
    }
    return out;
  }
  const same = (a, b) => !!a && !!b && (a.card != null ? a.card === b.card : a.el === b.el);
  function rectOf(f) {
    if (!f) return null;
    if (f.card != null) { const s = board.sprites.get(f.card); return s && !s.leaving ? s.el.getBoundingClientRect() : null; }
    return f.el && f.el.isConnected ? f.el.getBoundingClientRect() : null;
  }
  function home(list) {
    const v = view(), modal = topModal();
    // the natural stop may still be sliding in (off screen): take it anyway
    const pick = (sel) => list.find((x) => x.el && x.el.matches(sel)) || (() => {
      const el = [...(modal || stage).querySelectorAll(sel)].find((e) => !e.disabled && !e.closest('.modal-layer') === !modal && shownEl(e, true));
      return el ? { el, r: el.getBoundingClientRect() } : null;
    })();
    if (modal) return pick('.btn.blue') || pick('.btn.orange:not(.b-back)') || pick('.btn') || list[0];
    if (!v) return list[0];
    const firstCard = (area) => { const id = board.areas[area].find((x) => list.some((s) => s.card === x)); return id != null ? list.find((s) => s.card === id) : null; };
    if (v.state === 'BLIND_SELECT') return pick('.b-select') || list[0];
    if (v.state === 'ROUND_EVAL') return pick('.b-cashout') || list[0];
    if (v.state === 'SHOP') return firstCard('shop_jokers') || firstCard('shop_booster') || pick('.b-next') || list[0];
    if (PACK.test(v.state)) return firstCard('pack_cards') || pick('.b-skip-pack') || list[0];
    return firstCard('hand') || pick('.b-play') || list[0];
  }
  function setFocus(f) {
    const prev = focus;
    if (prev && prev.card != null && !same(prev, f)) { const s = board.sprites.get(prev.card); if (s) { s.hover = false; s.tilt.tx = s.tilt.ty = 0; } }
    focus = f ? (f.card != null ? { card: f.card } : { el: f.el }) : null;
    ringOn = !!focus;
    if (focus && focus.card != null) { const s = board.sprites.get(focus.card); if (s) s.hover = true; }
    showTip();
    place();
  }
  function showTip() {
    if (!focus) return;
    if (focus.card != null) {
      const s = board.sprites.get(focus.card);
      if (s && (tipsOn || board.sel === focus.card)) board.showCardTip(s, true);
      else if (board.tipFor === (focus && focus.card) || typeof board.tipFor === 'number') board.hideTip();
    } else if (tipsOn && focus.el && focus.el.classList.contains('tag-ico')) focus.el.click();
    else if (typeof board.tipFor === 'number') board.hideTip();
  }
  /** Is focus still on a live stop? If not, land on the state's natural one. */
  function ensure() {
    const list = stops();
    const v = view(), modal = topModal();
    const changed = (v && v.state) !== lastState || modal !== lastModal;
    lastState = v && v.state; lastModal = modal;
    if (!changed && focus && list.some((s) => same(s, focus))) return { list, ok: true };
    const h = list.length ? home(list) : null;
    setFocus(h);
    return { list, ok: false };
  }
  function move(dir) {
    const { list, ok } = ensure();
    if (!ok || !focus) return;
    const r0 = rectOf(focus);
    if (!r0) return;
    const [dx, dy] = DIRS[dir], c0 = center(r0);
    let best = null, bestScore = Infinity;
    for (const s of list) {
      if (same(s, focus)) continue;
      const c = center(s.r);
      const along = (c.x - c0.x) * dx + (c.y - c0.y) * dy;
      if (along <= 4) continue;
      const across = Math.abs((c.x - c0.x) * dy) + Math.abs((c.y - c0.y) * dx);
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (best) setFocus(best);
  }

  // ----------------------------------------------------------- actions
  function clickLike(el) {
    const r = el.getBoundingClientRect(), c = center(r);
    const init = { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y, button: 0, buttons: 1, pointerType: 'mouse', pointerId: 7, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
  }
  const sprite = () => (focus && focus.card != null ? board.sprites.get(focus.card) : null);
  async function activate() {
    const { ok } = ensure();
    if (!ok || !focus) return;                       // first press only shows where you are
    if (focus.el) {
      const el = focus.el;
      if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
        try {
          const { askText } = await import('/site/osk.js');
          const v = await askText({ title: el.placeholder || 'Enter text', initial: el.value, maxLength: el.maxLength > 0 ? el.maxLength : 40 });
          if (v != null) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
        } catch (e) { el.focus(); }
        return;
      }
      if (el.tagName === 'INPUT') { el.click(); return; }
      if (el.tagName === 'A') { el.click(); return; }
      clickLike(el);
      requestAnimationFrame(() => { ensure(); place(); });
      return;
    }
    const s = sprite();
    if (!s) return;
    const v = view();
    if (readOnly) { tipsOn = !tipsOn; showTip(); return; }
    switch (s.area) {
      case 'hand': board.clickCard(s, 'pad'); break;
      case 'shop_jokers': case 'shop_vouchers': case 'shop_booster': board.act({ type: 'buy', id: s.id }, 'coin1'); break;
      case 'pack_cards': board.act({ type: 'use', id: s.id }, 'button'); break;
      case 'consumeables':
        if (board.sel === s.id) board.act({ type: 'use', id: s.id }, 'button');
        else board.clickCard(s, 'pad');
        break;
      case 'jokers': board.clickCard(s, 'pad'); break;
      default: break;
    }
    showTip();
  }
  function secondary() {
    const s = sprite(), v = view();
    if (readOnly || !v) return;
    if (s && (s.area === 'jokers' || s.area === 'consumeables')) { board.act({ type: 'sell', id: s.id }, 'coin2'); return; }
    if (s && s.area === 'shop_jokers') {
      const d = board.data.get(s.id) || {};
      if (['Tarot', 'Planet', 'Spectral'].includes(d.set)) { board.act({ type: 'buy', id: s.id, use: true }, 'coin1'); return; }
    }
    if (v.state === 'SELECTING_HAND') {
      lastSort = lastSort === 'rank' ? 'suit' : 'rank';
      board.act({ type: 'sort_hand', by: lastSort }, 'cardSlide1');
    }
  }
  let lastSort = 'rank';
  const BUTTON_PAIRS = {
    SELECTING_HAND: ['.b-play', '.b-discard'],
    BLIND_SELECT: ['.b-select', '.b-skip'],
    SHOP: ['.b-next', '.b-reroll'],
    ROUND_EVAL: ['.b-cashout', null],
  };
  function pairFor(v) { if (!v) return [null, null]; if (PACK.test(v.state)) return [null, '.b-skip-pack']; return BUTTON_PAIRS[v.state] || [null, null]; }
  function shoulder(i) {
    if (readOnly || topModal()) return;
    const sel = pairFor(view())[i];
    if (!sel) return;
    const el = [...stage.querySelectorAll(sel)].find((b) => !b.disabled && shownEl(b));
    if (el) { clickLike(el); requestAnimationFrame(() => { ensure(); place(); }); }
  }
  function cancel() {
    const modal = topModal();
    if (modal) {
      if (modal.classList.contains('menu-modal') || modal.classList.contains('go-modal')) return;
      UI.closeModal(); requestAnimationFrame(() => { ensure(); place(); });
      return;
    }
    if (board.sel != null) { board.sel = null; board.refreshSelection(); board.hideTip(); return; }
    const v = view();
    if (!readOnly && v && (v.state === 'SELECTING_HAND' || PACK.test(v.state)) && board.handHighlighted().length) board.opts.onAction({ type: 'highlight', ids: [] });
  }
  function reorderStep(dir) {
    const s = board.sprites.get(hold.id);
    if (!s || !REORDER.includes(s.area) || (dir !== 'left' && dir !== 'right')) return;
    const ids = board.areas[s.area].slice();
    const i = ids.indexOf(hold.id), j = i + (dir === 'left' ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = board.opts.onAction({ type: 'reorder', area: s.area, ids });
    if (r && r.ok) { hold.moved = true; board.areas[s.area] = ids; board.layout(); }
  }

  // --------------------------------------------------------------- input
  let loginHinted = 0;
  function onPress(action) {
    if (!signed) {
      if (Date.now() - loginHinted > 4000) { loginHinted = Date.now(); board.toast('Log in to use a controller'); }
      return;
    }
    if (document.getElementById('osk')) return;            // the on-screen keyboard runs its own pad
    if (!ringOn && focus) { ringOn = true; place(); if (action !== 'menu' && action !== 'select') return; }
    if (hold && DIRS[action]) { reorderStep(action); return; }
    if (DIRS[action]) { move(action); return; }
    switch (action) {
      case 'confirm': {
        const { ok } = ensure();
        if (!ok) return;
        const s = sprite();
        const v = view();
        const canMove = s && !readOnly && REORDER.includes(s.area) && v && (s.area !== 'hand' || v.state === 'SELECTING_HAND' || PACK.test(v.state));
        if (canMove) { hold = { id: s.id, moved: false }; return; }   // acts on release (unless it moved)
        activate();
        return;
      }
      case 'cancel': cancel(); return;
      case 'context': tipsOn = !tipsOn; if (!tipsOn) board.hideTip(); showTip(); renderHints(); return;
      case 'secondary': secondary(); return;
      case 'prev': shoulder(0); return;
      case 'next': shoulder(1); return;
      case 'select': if (topModal() && topModal().classList.contains('dv-modal')) UI.closeModal(); else if (view()) onMenu('deck'); return;
      case 'menu': {
        const m = topModal();
        if (m && m.classList.contains('pause-modal')) { UI.closeModal(); return; }
        if (m && (m.classList.contains('menu-modal') || m.classList.contains('go-modal'))) return;
        UI.pauseMenu({ readOnly, onMenu, mainMenu, chat: () => toggleChat() });
        requestAnimationFrame(() => { ensure(); place(); });
        return;
      }
      default:
    }
  }
  function onRelease(action, info) {
    if (action !== 'confirm' || !hold) return;
    const h = hold; hold = null;
    if (!h.moved && !(info && info.forced)) activate();
  }
  function toggleChat() {
    const c = document.getElementById('mp-chat');
    if (!c) return;
    const b = c.querySelector('button, [role=button]');
    if (b) b.click();
  }

  // ---------------------------------------------------------- reticle
  function place() {
    if (!ringOn || !focus) { reticle.style.display = 'none'; return; }
    const r = rectOf(focus);
    if (!r) { reticle.style.display = 'none'; return; }
    const sr = stage.getBoundingClientRect(), k = board.scale || 1;
    const pad = 6;
    reticle.style.display = '';
    reticle.style.left = ((r.left - sr.left) / k - pad) + 'px';
    reticle.style.top = ((r.top - sr.top) / k - pad) + 'px';
    reticle.style.width = (r.width / k + pad * 2) + 'px';
    reticle.style.height = (r.height / k + pad * 2) + 'px';
    reticle.classList.toggle('holding', !!hold);
    reticle.classList.toggle('in-modal', !!topModal());
  }
  let lastHints = '';
  function renderHints() {
    if (!pad || !pad.connected()) { hints.style.display = 'none'; return; }
    hints.style.display = '';
    const st = loadPadSettings();
    const L = (a) => `<span class="pk">${buttonLabel(a, kind, { layout: st.layout, remap: st.remap })}</span>`;
    const v = view(), s = sprite(), modal = topModal();
    const parts = [];
    if (!signed) { parts.push('Log in to use a controller'); }
    else if (modal) { parts.push(`${L('confirm')} Choose`, `${L('cancel')} Back`); }
    else if (readOnly) { parts.push(`${L('confirm')} Info`, `${L('select')} Deck`, `${L('menu')} Menu`); }
    else {
      let c = 'Press';
      if (s) c = { hand: 'Select', jokers: board.sel === s.id ? 'Deselect' : 'Choose', consumeables: board.sel === s.id ? 'Use' : 'Choose', shop_jokers: 'Buy', shop_vouchers: 'Redeem', shop_booster: 'Open', pack_cards: 'Take' }[s.area] || 'Press';
      parts.push(`${L('confirm')} ${c}`);
      if (s && REORDER.includes(s.area)) parts.push(`hold ${L('confirm')}+◀▶ Move`);
      let sec = null;
      if (s && (s.area === 'jokers' || s.area === 'consumeables')) sec = 'Sell';
      else if (s && s.area === 'shop_jokers' && ['Tarot', 'Planet', 'Spectral'].includes((board.data.get(s.id) || {}).set)) sec = 'Buy & Use';
      else if (v && v.state === 'SELECTING_HAND') sec = 'Sort';
      if (sec) parts.push(`${L('secondary')} ${sec}`);
      const names = { '.b-play': 'Play', '.b-discard': 'Discard', '.b-select': 'Select', '.b-skip': 'Skip', '.b-next': 'Next Round', '.b-reroll': 'Reroll', '.b-cashout': 'Cash Out', '.b-skip-pack': 'Skip' };
      const [p, n] = pairFor(v);
      if (p) parts.push(`${L('prev')} ${names[p]}`);
      if (n) parts.push(`${L('next')} ${names[n]}`);
      parts.push(`${L('context')} Info${tipsOn ? ' ✓' : ''}`, `${L('menu')} Menu`);
    }
    const html = parts.join('<span class="sep"></span>');
    if (html !== lastHints) { hints.innerHTML = html; lastHints = html; }
  }

  // ------------------------------------------------------------- wiring
  const pad = startGamepad({
    readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
    onPress, onRelease,
    onConnect: (e) => { kind = e.kind || 'generic'; if (!signed) board.toast('Log in to use a controller'); renderHints(); },
    onDisconnect: () => { setTimeout(() => { if (!pad.connected()) { ringOn = false; hold = null; place(); renderHints(); const s = sprite(); if (s) s.hover = false; } }, 0); },
    onFrame: () => {
      if (!pad.connected()) { if (hints.style.display !== 'none') hints.style.display = 'none'; return; }
      if (ringOn) {
        // the table changed under the reticle (new state, card gone): re-home without acting
        const v = view();
        if ((v && v.state) !== lastState || topModal() !== lastModal || (focus && !rectOf(focus))) ensure();
        place();
      }
      renderHints();
    },
  });
  addEventListener('pointermove', (e) => {
    if (!ringOn || !e.isTrusted) return;
    ringOn = false; place();
    const s = sprite(); if (s) s.hover = false;
  }, { passive: true });

  const api = {
    pad,
    get focus() { return focus ? (focus.card != null ? { card: focus.card, area: (board.sprites.get(focus.card) || {}).area } : { el: focus.el, cls: focus.el.className }) : null; },
    get tipsOn() { return tipsOn; },
    focusCard(id) { const s = board.sprites.get(id); if (s) setFocus({ card: id }); },
    ensure, move,
    onGameEvent(ev) {
      if (!pad.connected()) return;
      if (ev.type === 'chips' && ev.add) rumble(0.35, 90);
      else if (ev.type === 'blind' && ev.action === 'set' && ev.boss) rumble(0.6, 220);
      else if (ev.type === 'game_over') rumble(0.9, 420);
      else if (ev.type === 'win') rumble(0.7, 320);
    },
  };
  window.__micatroPad = api;
  return api;
}
