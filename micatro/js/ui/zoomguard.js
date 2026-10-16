// zoomguard.js — keep iPhone Safari from getting stuck zoomed in.
//
// The board is a fixed-size stage scaled to fit the screen, so a browser zoom only ever
// hides part of it. iOS Safari ignores `user-scalable=no` / `maximum-scale=1` (accessibility)
// and only honours `touch-action: auto | manipulation` — so the old `touch-action: none` on
// html/body did nothing there: a quick double tap on the felt zoomed the page in, and a pinch
// that started on a card (the board preventDefaults card presses) could not zoom back out.
// A tester got stuck zoomed into the right half of the board with no way back.
//
// Two layers: micatro.css now uses `touch-action: manipulation` (no double-tap zoom, still
// honoured by iOS), and this guard snaps the page back to 1x whenever it ends up zoomed for
// any other reason (a pinch, a text box focus) — except while you are typing in a text box.
// Rewriting the viewport meta is the one thing iOS Safari re-reads and resets its zoom for.

const EPS = 0.02;
const typing = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit)$/i.test(el.type || '')) || el.isContentEditable);

/** Should the page be snapped back? scale = visualViewport.scale, active = document.activeElement. */
export function shouldReset(scale, active) {
  return scale > 1 + EPS && !typing(active);
}

/** Make the browser re-apply the viewport (iOS resets its zoom to initial-scale). */
export function resetZoom(doc = document) {
  const meta = doc.querySelector('meta[name="viewport"]');
  if (!meta) return false;
  const content = meta.getAttribute('content');
  meta.setAttribute('content', content.replace(/,?\s*maximum-scale=[^,]*/, '') + ', maximum-scale=1.0');
  // restore the exact original on the next frame (the rewrite above is what triggers the reset)
  (doc.defaultView || window).requestAnimationFrame(() => meta.setAttribute('content', content));
  return true;
}

export function installZoomGuard(win = window) {
  const vv = win.visualViewport;
  if (!vv) return null;
  let pending = 0;
  const check = () => {
    pending = 0;
    if (shouldReset(vv.scale, win.document.activeElement)) resetZoom(win.document);
  };
  // after the gesture settles (a pinch fires many resizes)
  const soon = () => { if (!pending) pending = win.setTimeout(check, 350); };
  vv.addEventListener('resize', soon);
  // leaving a text box: iOS keeps the focus zoom after the keyboard closes
  win.document.addEventListener('focusout', (e) => { if (typing(e.target)) win.setTimeout(check, 50); });
  return { check };
}
