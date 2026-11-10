// pad.js — controller play for Micatro (site/gamepad.js core, Nintendo layout:
// right face = confirm, bottom face = cancel). Everyone, guests included
// (the owner dropped the signed-in-only rule on 2026-10-18).
//
// A focus reticle moves between every card and button on the table (or the
// open modal) with the d-pad / left stick — the same spatial scoring as
// battlecards/padnav.js. Buttons:
//   confirm   hand card: toggle selection · shop item: buy · pack card: take it
//             owned joker/consumable: select it (again = use a consumable) · button: press
//             HOLD confirm + ←/→ on a hand card / joker / consumable: move it
//   secondary owned card: sell · shop consumable: buy & use · otherwise: sort hand (rank ⇄ suit)
//   context   card info (tooltip) on/off
//             a Page (the Pages screen): raise it · again: take it
//             a deck card (a Page's "remove a card" prize): raise it · again: remove it
//   LB / RB   the screen's two main buttons: Play Hand / Discard, Select / Skip blind, (Pages) RB: Choose,
//             Next Round / Reroll, Cash Out, Skip pack
//             (in the deck editor's picker: previous / next page)
//   cancel    close a dialog · deselect
//   Start     pause menu (options, speed, run info, deck, quit)   Select  deck view
// Replay viewer (?replay=): LB / RB step back / forward, secondary plays / pauses, and the replay
// bar's buttons (#replay-bar, outside the stage) are stops like any other button.
// The reticle hides when the mouse moves or the pad disconnects.
//
// KEYBOARD (controls sweep B5): the same reticle and the same actions, from site/input.js (by physical key):
//   arrows / WASD move · Z confirm (hold Z + ←/→ moves a card) · X cancel · C secondary · V context (info) ·
//   Q / E = LB / RB · Enter = Start (pause) · Backspace = Select (deck). A text field the reticle presses takes the
//   keyboard's focus (type, then Esc to leave it); the hint bar shows the keys while the keyboard drives.
//   Input never changes WHAT is recorded: every press ends in the same board.act / onAction call a click or a tap makes.
import { buttonLabel, loadPadSettings, rumble } from '/site/gamepad.js';
import { startInput, keyLabel } from '/site/input.js';
import { isConsumableSet } from './assets.js';

const CARD_AREAS = ['hand', 'jokers', 'consumeables', 'shop_jokers', 'shop_vouchers', 'shop_booster', 'pack_cards'];
const REORDER = ['hand', 'jokers', 'consumeables'];
const PACK = /_PACK(_HAND)?$/;   // TAROT_PACK ... BUFFOON_PACK, MOD_PACK, MOD_PACK_HAND
const DOM_SEL = 'button:not(:disabled), a[href], input, .deck-pile, .tag-ico, [data-pad]';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const onScreen = (r) => r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 4 && r.height > 4;

export function initPad({ board, stage, UI, readOnly, onMenu, mainMenu, replay = null }) {
  let focus = null;            // {card:id} | {el}
  let ringOn = false, tipsOn = false, hold = null, lastState = null, lastModal = null, kind = 'generic';
  let src = 'pad';             // what drove the last press: 'pad' | 'key' (the hint bar's labels; a text field's activation)

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
    const rbar = replay ? document.getElementById('replay-bar') : null;
    if (rbar) for (const el of rbar.querySelectorAll(DOM_SEL)) if (shownEl(el)) out.push({ el, r: el.getBoundingClientRect() });
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
    if (v.state === 'PAGES') return pick('.page-card.sel') || pick('.page-card') || list[0];
    if (v.state === 'PAGE_REMOVE') return pick('.premove-card.sel') || pick('.premove-card') || list[0];
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
    // a long modal (the Mods panel) scrolls to keep the focused control in view
    if (focus && focus.el && focus.el.closest('.modal-box') && focus.el.scrollIntoView) { try { focus.el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
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
    // (mid-animation the board may already show the next screen — a booster's pack screen as it opens, board.js
    //  enterPackView — before its cards are dealt: the state change counts once the sequence ends, so focus homes
    //  onto the pack's cards, not whatever was there first)
    const st = board.locked ? lastState : v && v.state;
    const changed = st !== lastState || modal !== lastModal;
    lastState = st; lastModal = modal;
    if (!changed && focus && list.some((s) => same(s, focus))) return { list, ok: true };
    // a control that was rebuilt in place (Mods panel toggles) keeps the focus via its data-k
    const k = !changed && focus && focus.el && !focus.el.isConnected && focus.el.dataset ? focus.el.dataset.k : null;
    const again = k ? list.find((s) => s.el && s.el.dataset && s.el.dataset.k === k) : null;
    if (again) { setFocus(again); return { list, ok: true }; }
    const h = list.length ? home(list) : null;
    setFocus(h);
    homedAt = h ? performance.now() : 0;
    return { list, ok: false };
  }
  // (the screen's natural stop may not be there yet when the reticle re-homes — the blind select's columns rise in after a
  //  skip: for a moment after homing, each frame moves it on to the natural stop once that shows, until the player acts)
  let homedAt = 0;
  const HOME_SETTLE_MS = 1500;
  function settleHome() {
    if (!homedAt || hold) return;
    if (performance.now() - homedAt > HOME_SETTLE_MS) { homedAt = 0; return; }
    const list = stops();
    const h = list.length ? home(list) : null;
    if (h && !same(h, focus)) setFocus(h);
  }
  function move(dir) {
    homedAt = 0;
    const { list, ok } = ensure();
    if (!ok || !focus) return;
    const r0 = rectOf(focus);
    if (!r0) return;
    // the Pages row: left / right step along the Pages in their order. (Their rects can't be trusted for this while they fly
    // in — the pagein animation, replayed on every overlay render — a press then measured the next Page far below and
    // landed on Choose.)
    if (focus.el && focus.el.classList.contains('page-card') && (dir === 'left' || dir === 'right')) {
      const i = +focus.el.dataset.page + (dir === 'right' ? 1 : -1);
      const el = i >= 0 ? focus.el.parentElement && focus.el.parentElement.querySelector(`.page-card[data-page="${i}"]`) : null;
      if (el) { setFocus({ el }); return; }
    }
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
  const focusedSprite = () => (focus && focus.card != null ? board.sprites.get(focus.card) : null);
  const sprite = () => (ringOn && focus && focus.card != null ? board.sprites.get(focus.card) : null);
  async function activate() {
    homedAt = 0;
    const { ok } = ensure();
    if (!ok || !focus) return;                       // first press only shows where you are
    if (focus.el) {
      const el = focus.el;
      if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
        // the keyboard types straight into it (site/input.js leaves a focused text field alone; Esc leaves it: ui/main.js onKey)
        if (src === 'key') { el.focus(); if (el.select && /^(text|search)$/.test(el.type)) try { el.select(); } catch (e) { /* ignore */ } return; }
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
      case 'pack_cards': { const d = s.d || {}; board.act(d.no_use && d.reserve ? { type: 'reserve', id: s.id } : { type: 'use', id: s.id }, 'button'); break; }
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
    if (replay && !topModal()) { replay.toggle(); return; }
    const s = sprite(), v = view();
    if (readOnly || !v) return;
    if (s && (s.area === 'jokers' || s.area === 'consumeables')) { board.act({ type: 'sell', id: s.id }, 'coin2'); return; }
    if (s && s.area === 'shop_jokers') {
      const d = board.data.get(s.id) || {};
      if (isConsumableSet(d.set)) { board.act({ type: 'buy', id: s.id, use: true }, 'coin1'); return; }
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
    PAGES: [null, '.b-pick-page'],
    PAGE_REMOVE: [null, '.b-page-remove'],
    SHOP: ['.b-next', '.b-reroll'],
    ROUND_EVAL: ['.b-cashout', null],
  };
  function pairFor(v) { if (!v) return [null, null]; if (PACK.test(v.state)) return [null, '.b-skip-pack']; return BUTTON_PAIRS[v.state] || [null, null]; }
  function shoulder(i) {
    if (replay && !topModal()) { replay.step(i ? 1 : -1); return; }
    // a paged list in the open dialog (the deck editor's picker): LB / RB turn the page
    const pg = topModal() && topModal().querySelector('[data-pad-pager]');
    if (pg) {
      const b = pg.querySelector(i ? '.b-cd-pg-next' : '.b-cd-pg-prev');
      if (b && !b.disabled && shownEl(b, true)) { clickLike(b); requestAnimationFrame(() => { ensure(); place(); }); }
      return;
    }
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
  function onPress(action) {
    if (document.getElementById('osk')) return;            // the on-screen keyboard runs its own pad
    if (!ringOn && focus) {
      // the reticle is hidden (the mouse took over): a controller's first press only shows it (Start / Select still act);
      // a key that MOVES or PRESSES it only shows it too, but a hotkey-like key (Q / E / C / V / X / Enter / Backspace)
      // acts at once — on no card (sprite() is null while hidden), so C sorts and never sells a card the player can't see
      const showOnly = src === 'key' ? (!!DIRS[action] || action === 'confirm') : (action !== 'menu' && action !== 'select');
      if (showOnly || src !== 'key') { ringOn = true; place(); }
      if (showOnly) return;
    }
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
  // one handler for both sources (site/input.js: keyboard + the site/gamepad.js poller). true = the key was used.
  function onAction(action, info) {
    const source = (info && info.source) || 'pad';
    if (source === 'key') {
      // a button / link the player Tabbed to keeps the browser's own Enter
      const ae = document.activeElement;
      if (action === 'menu' && ae && ae !== document.body && /^(BUTTON|A)$/.test(ae.tagName) && ae.matches(':focus-visible')) return false;
      src = 'key';
    } else src = 'pad';
    onPress(action, info);
    if (source === 'key') renderHints();
    return true;
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
  // the bar shows while a controller is connected, or while the keyboard drives the reticle (gone with the mouse)
  const keysOn = () => src === 'key' && ringOn;
  const hintsOn = () => keysOn() || !!(pad && pad.connected());
  function renderHints() {
    if (!hintsOn()) { hints.style.display = 'none'; return; }
    hints.style.display = '';
    const st = keysOn() ? null : loadPadSettings();
    hints.classList.toggle('keys', !st);
    const L = (a) => `<span class="pk">${st ? buttonLabel(a, kind, { layout: st.layout, remap: st.remap }) : keyLabel(a)}</span>`;
    const v = view(), s = sprite(), modal = topModal();
    const parts = [];
    if (modal) { parts.push(`${L('confirm')} Choose`, `${L('cancel')} Back`); }
    else if (replay) { parts.push(`${L('confirm')} Press`, `${L('secondary')} Play/Pause`, `${L('prev')}${L('next')} Step`, `${L('menu')} Menu`); }
    else if (readOnly) { parts.push(`${L('confirm')} Info`, `${L('select')} Deck`, `${L('menu')} Menu`); }
    else {
      let c = 'Press';
      if (s) c = { hand: 'Select', jokers: board.sel === s.id ? 'Deselect' : 'Choose', consumeables: board.sel === s.id ? 'Use' : 'Choose', shop_jokers: 'Buy', shop_vouchers: 'Redeem', shop_booster: 'Open', pack_cards: 'Take' }[s.area] || 'Press';
      parts.push(`${L('confirm')} ${c}`);
      if (s && REORDER.includes(s.area)) parts.push(`hold ${L('confirm')}+◀▶ Move`);
      let sec = null;
      if (s && (s.area === 'jokers' || s.area === 'consumeables')) sec = 'Sell';
      else if (s && s.area === 'shop_jokers' && isConsumableSet((board.data.get(s.id) || {}).set)) sec = 'Buy & Use';
      else if (v && v.state === 'SELECTING_HAND') sec = 'Sort';
      if (sec) parts.push(`${L('secondary')} ${sec}`);
      const names = { '.b-play': 'Play', '.b-discard': 'Discard', '.b-select': 'Select', '.b-skip': 'Skip', '.b-next': 'Next Round', '.b-reroll': 'Reroll', '.b-cashout': 'Cash Out', '.b-skip-pack': 'Skip', '.b-pick-page': 'Choose', '.b-page-remove': 'Remove' };
      const [p, n] = pairFor(v);
      if (p) parts.push(`${L('prev')} ${names[p]}`);
      if (n) parts.push(`${L('next')} ${names[n]}`);
      parts.push(`${L('context')} Info${tipsOn ? ' ✓' : ''}`, `${L('select')} Deck`, `${L('menu')} Menu`);
    }
    const html = parts.join('<span class="sep"></span>');
    if (html !== lastHints) { hints.innerHTML = html; lastHints = html; }
  }

  // ------------------------------------------------------------- wiring
  // (site/input.js: the keyboard listener + one site/gamepad.js poller, both into onAction)
  const input = startInput({
    pad: true,
    onAction, onRelease,
    padOptions: {
      onConnect: (e) => { kind = e.kind || 'generic'; src = 'pad'; renderHints(); },
      onDisconnect: () => { setTimeout(() => { if (!pad.connected() && src !== 'key') { ringOn = false; hold = null; place(); renderHints(); const s = focusedSprite(); if (s) s.hover = false; } }, 0); },
    },
    onFrame: () => {
      if (!hintsOn()) { if (hints.style.display !== 'none') hints.style.display = 'none'; return; }
      if (ringOn) {
        // the table changed under the reticle (new state, card gone): re-home without acting
        const v = view();
        if (((v && v.state) !== lastState && !board.locked) || topModal() !== lastModal || (focus && !rectOf(focus))) ensure();
        else settleHome();
        place();
      }
      renderHints();
    },
  });
  const pad = input.pad;
  addEventListener('pointermove', (e) => {
    if (!ringOn || !e.isTrusted) return;
    ringOn = false; hold = null; place(); renderHints();
    const s = focusedSprite(); if (s) s.hover = false;
  }, { passive: true });

  const api = {
    pad, input,
    get source() { return src; },
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
