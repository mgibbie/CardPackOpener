// zoomfix.js — one <script type="module" src="/site/zoomfix.js"> for a full-screen game page,
// so iPhone Safari can't strand you zoomed into part of it (a tester got stuck in Micatro).
//
// iOS Safari ignores `user-scalable=no` / `maximum-scale=1` and doesn't stop double-tap zoom
// for children of an html/body `touch-action: none`. So:
//  1. every element gets `touch-action: manipulation` (no double-tap zoom; taps stay instant),
//     at zero specificity so any rule the page already has wins — canvases (the game surface)
//     default to `none` so drags/swipes on them stay the game's on every browser;
//  2. on pages whose viewport meta locks zoom, ./zoomguard.js snaps any zoom that still happens
//     (a pinch, a text-box focus) back to 1x. Pages that allow zoom on purpose keep it.
import { installZoomGuard } from './zoomguard.js';

const css = document.createElement('style');
css.id = 'zoomfix-css';
css.textContent = ':where(html, body, body *) { touch-action: manipulation; } :where(canvas) { touch-action: none; }';
document.head.prepend(css); // first, so the page's own touch-action rules come later and win

const meta = document.querySelector('meta[name="viewport"]');
const locked = !!meta && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0+)?\b/.test(meta.getAttribute('content') || '');
window.__zoomGuard = locked ? installZoomGuard(window) : null;
