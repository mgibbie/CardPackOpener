// client_modules_test.mjs — node smokes for the client-side modules that had
// zero behavioral coverage: sfx.js (synth audio), chat.js (emote chat),
// profile.js (player-profile popup). All three import cleanly WITHOUT a DOM —
// that import-safety is itself the contract this pins (a top-level document/
// window touch would crash any page that loads them before DOMContentLoaded).
// replays.js is deliberately absent: it binds the DOM at import by design and
// is covered by the static imports lint (battlecards_imports_test).
import * as SFX from '../../sfx.js';
import * as Chat from '../../chat.js';
import * as Profile from '../../profile.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ---- sfx: safe before any user gesture, mute round-trips ----
ok('sfx exports its tiny surface', typeof SFX.play === 'function' && typeof SFX.setMuted === 'function' && typeof SFX.isMuted === 'function');
let threw = null;
try { SFX.play('damage'); SFX.play('victory'); SFX.play('__no_such_sound__'); } catch (e) { threw = e.message; }
ok('play() is a safe no-op before the AudioContext exists (autoplay policy)', threw === null, threw);
SFX.setMuted(true);
ok('setMuted(true) sticks', SFX.isMuted() === true);
SFX.setMuted(false);
ok('setMuted(false) sticks', SFX.isMuted() === false);

// ---- chat: the emote table is real; the DOM surface is functions ----
ok('chat exports mount/unmount/send/clear/active', ['mount', 'unmount', 'send', 'clear'].every(k => typeof Chat[k] === 'function'));
const emotes = Object.values(Chat.EMOTES || {});
ok('the emote table maps ids to {icon, label} entries',
	emotes.length >= 6 && emotes.every(e => e && typeof e.icon === 'string' && e.icon && typeof e.label === 'string' && e.label),
	JSON.stringify(Chat.EMOTES).slice(0, 120));
ok('no duplicate emote icons', new Set(emotes.map(e => e.icon)).size === emotes.length);

// ---- profile: the popup entry point exists ----
ok('profile exports openProfile', typeof Profile.openProfile === 'function');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
