# site/ui — the Balatro-style UI kit

One look for the whole site, taken from what Micatro already draws. Micatro, Pocket Enhanced, Pair of Pears and
Scoundrel already look like this: `micatro/css/micatro.css` imports this kit and takes its palette from the kit's
tokens. Every other page adopts the kit with the three steps below.

**See it live:** `/site/ui/` (the style guide) shows every component, the canvas helpers and the button sounds.
Test: `overworld/tests/site_ui_kit_test.mjs`.

| File | What it is |
|---|---|
| `balatro.css` | design tokens (`--bal-*`), the m6x11 font, components as plain `.bal-*` classes |
| `sfx.js` | button-press style sound effects (Micatro's .ogg files; no music) + `sfx.wire(root)` |
| `canvas.js` | the same look for 2D-canvas UIs (overworld menus, Pokémon battles), sized by a unit `u` |
| `index.html` | the living style guide |

## Adopting it on a page

```html
<link rel="preload" href="/micatro/assets/fonts/m6x11plus.ttf?v=2" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="/site/ui/balatro.css">
<body class="bal-page">
  <div class="bal-panel">
    <h2 class="bal-h2">Options</h2>
    <button class="bal-btn bal-blue">Play</button>
    <button class="bal-btn bal-back">Back</button>
  </div>
  <script type="module">import { sfx } from '/site/ui/sfx.js'; sfx.wire(document);</script>
</body>
```

Everything in the kit is prefixed (`.bal-*`, `--bal-*`, `@keyframes bal-*`), so loading the file changes nothing until
a class is used. A page can adopt it one component at a time.

## Tokens (`:root`)

| Token | Value | Use |
|---|---|---|
| `--bal-blue` / `-d` | `#009dff` / `#0076c2` | Play / chips; `-d` = the darker lip under a button |
| `--bal-red` / `-d` | `#fe5f55` / `#c0453d` | Discard / mult / the chosen tab / toasts |
| `--bal-green` / `-d` | `#4bc292` / `#33906b` | Next / confirm |
| `--bal-orange` / `-d` | `#fda200` / `#c27c00` | Options / secondary |
| `--bal-purple` / `-d` | `#8867a5` / `#6b4585` | Use / special |
| `--bal-grey` / `-d` | `#5f7377` / `#435357` | the default button |
| `--bal-gold` / `-d` | `#eac058` / `#b48f34` | gold |
| `--bal-money` | `#f3b958` | `$` amounts |
| `--bal-attn` | `#ff9a00` | attention, "you" highlights |
| `--bal-tarot`, `--bal-planet`, `--bal-spectral` | | card-set badges |
| `--bal-panel`, `--bal-panel-d`, `--bal-panel-dd` | `#3a4b4f`, `#2a3739`, `#1f2a2c` | a box, a row in it, a well in that |
| `--bal-panel-line`, `--bal-outline-light`, `--bal-edge` | `#46595d`, `#bfc7d5`, `#4f6367` | box outline, tooltip/dialog outline, scrollbar |
| `--bal-text`, `--bal-text-dark`, `--bal-text-muted`, `--bal-text-soft` | | white, on-white text, muted, soft |
| `--bal-felt-1..3`, `--bal-bg` | | the green table felt and the flat colour behind it |
| `--bal-font` | `'m6x11', 'Courier New', monospace` | the font |

## Components

| Class | Notes |
|---|---|
| `.bal-page` | on `<body>`: felt background, m6x11, white text, themed scrollbars |
| `.bal-felt` | the felt background only |
| `.bal-panel` (+ `.bal-outlined`, `.bal-flat`) | the box: dark lip + inner outline; outlined = the dialog / tooltip outline |
| `.bal-inset`, `.bal-well`, `.bal-white` | a row inside a panel, a number's slot, white card text |
| `.bal-btn` | the button. Colour: `.bal-blue` `.bal-red` `.bal-green` `.bal-orange` `.bal-purple` `.bal-gold` `.bal-grey`. Size: `.bal-sm` `.bal-lg`, `.bal-wide` (full width). Sized in `em`, so any font-size scales it. States: `:hover`, `:active` / `.is-pressed` (sinks onto its lip), `:disabled` / `.is-disabled`, `:focus-visible` / `.is-focus` (white ring), `.is-on` |
| `.bal-tabs > .bal-btn.bal-tab` | tabs; the chosen one `.is-on` or `aria-selected="true"` (red + white ring) |
| `.bal-seg > .bal-btn` | a segmented choice; the chosen one `.is-on` / `aria-pressed="true"` (red) |
| `.bal-input`, `.bal-select`, `.bal-check`, `.bal-range` | text field, select, checkbox (a well that turns red with a tick), slider |
| `.bal-field` | a label + control row |
| `.bal-modal > .bal-modal-box > .bal-modal-title` (+ `.bal-modal-acts`) | dialog; hide with `[hidden]` |
| `.bal-toast` (+ `.is-show` to play, colours) | the red pop-up message; `.is-static` to show in place |
| `.bal-banner` | the dark strip ("Watching …") |
| `.bal-bar > .bal-bar-fill` (+ colour) | a fill bar; set the fill's `width` |
| `.bal-list > .bal-row` (`.is-me`, `.is-on`) | list rows; `button.bal-row` / `a.bal-row` are pressable |
| `.bal-table` (`tr.is-me`) | a table of rows |
| `.bal-tip > .bal-tip-name + .bal-tip-body` | the tooltip box |
| `[data-bal-tip="text"]` | a CSS-only hover / focus tip on any element |
| `.bal-badge` (+ colour), `.bal-chip`, `.bal-key` | badges, pills, key caps (`Z`, `X`) |
| `.bal-h1` `.bal-h2` `.bal-h3` `.bal-logo` | headings; the logo has Micatro's red/blue offset shadows |
| `.bal-shadow`, `.bal-muted`, `.bal-t-money` / `-blue` / `-red` / `-green` / `-attn` / `-gold` / `-dark` | text helpers |
| `.bal-scroll` | thin themed scrollbars on any scrolling box |

## Sounds (`sfx.js`)

```js
import { sfx } from '/site/ui/sfx.js';
sfx.wire(document);   // every .bal-btn / .bal-tab / button.bal-row / [data-sfx] click plays its sound
```

| Call | Sound (Micatro's file) |
|---|---|
| `sfx.press()` | `button` (every Micatro button) |
| `sfx.back()` / `sfx.cancel()` | `cancel` |
| `sfx.error()` | `cancel`, lower (a refused action) |
| `sfx.hover()` | `paper1`, quiet, pitch-jittered (Balatro's card hover) |
| `sfx.select()` | `highlight1` |
| `sfx.tab()` | `paper1` (Balatro's sort buttons) |
| `sfx.open()` / `sfx.close()` | `cardSlide1` / `cardSlide2`, quiet. Balatro has no panel sounds, so these are its card slides |
| `sfx.coin()` | `coin1..3` |
| `sfx.card()` | `card1` |
| `sfx.chips()` | `chips1` |
| `sfx.win()` | `win` (a jingle, not music) |
| `sfx.play(name, pitch, vol)` | any of `sfx.NAMES`: Micatro's 50 sound effects |

`wire(root, {hover})` picks the sound for a click like this:
- the element's `data-sfx` (a call name above or a sound name; `"none"` = silent);
- else `back` for `.bal-back`;
- else `tab` for `.bal-tab`;
- else `press`.

Disabled buttons are silent. Keyboard Enter/Space and a controller's A are clicks too. `[data-sfx-hover]` elements (or
every kit button, with `{hover: true}`) play `hover()` on mouse-over. `wire` returns `unwire()`.

Rules it keeps:
- **On/off is Micatro's setting**, `localStorage.micatro_sfx` (`'0'` = off). `sfx.enabled()` and `sfx.setEnabled(on)`
  read and write it, so it is one switch shared with Micatro, Pocket, Pears and Scoundrel. The volume is Micatro's
  (0.55 master).
- **Nothing plays before a user gesture.** The AudioContext is made on the first pointerdown or keydown. Calls before
  that are dropped.
- The owner's audio swaps (`mt.sound:<name>` in `/audioswap/`) apply, as they do in Micatro.
- There is **no music** in this module.

## Canvas (`canvas.js`)

```js
import * as BC from '/site/ui/canvas.js';
await BC.loadFont();                                         // m6x11 for canvas (document.fonts)
BC.panel(ctx, x, y, w, h, u, { fill, lip: 6, outline: 'light' | colour | false, r: 12 });
BC.button(ctx, { x, y, w, h, label, color: 'blue', pressed, focused, hovered, disabled, on, size, sub }, u);
BC.text(ctx, 'Hello', x, y, u, { size: 16, color, align, baseline, shadow: true, outline: false, maxW });
BC.bar(ctx, x, y, w, h, frac, u, { color, back });            // an HP-like bar
const r = BC.tooltip(ctx, x, y, u, { title, body, maxW: 220, anchor: 'above' });
BC.hit(b, px, py); BC.font(px); BC.roundRect(ctx, x, y, w, h, r); BC.C /* the palette */; BC.BUTTON /* colour -> [face, lip] */
```

- `u` is canvas px per design px, as `overworld/battleui.js` and `ow_menus.js` already use it.
- Buttons take the same `{x, y, w, h, label}` boxes as `battleui.js button()`. The box includes the lip, so hit tests
  stay right while a button is pressed.
- `button()` colours are `grey`, `blue`, `red`, `green`, `orange`, `purple`, `gold`, `tab`, or `[face, lip]`.
- The canvas font string is `m6x11, m6x11plus, monospace`. The overworld already registers the same file as
  `m6x11plus`, so either name renders it.
