// Sounds: Balatro's .ogg set, lazily decoded through WebAudio. Nothing plays
// until the first user gesture (autoplay rules); SFX + music toggles persist.
import { assetUrl } from './assets.js';
import { SOUNDS } from '../mods/registry.js'; // mod sounds by full key ('mf_gun' -> {src, music?})

const KEY_SFX = 'micatro_sfx', KEY_MUSIC = 'micatro_music';
const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch (e) { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* private mode */ } };

const KNOWN = new Set(['button', 'cancel', 'card1', 'card3', 'cardFan2', 'cardSlide1', 'cardSlide2', 'chips1', 'chips2',
  'coin1', 'coin2', 'coin3', 'coin4', 'coin5', 'coin6', 'coin7', 'crumple1', 'crumple2', 'crumple3', 'crumple4', 'crumple5',
  'crumpleLong1', 'explosion1', 'foil1', 'foil2', 'generic1', 'glass1', 'glass2', 'glass3', 'glass4', 'gold_seal', 'gong',
  'highlight1', 'highlight2', 'holo1', 'magic_crumple', 'multhit1', 'multhit2', 'negative', 'other1', 'paper1',
  'polychrome1', 'slice1', 'tarot1', 'tarot2', 'timpani', 'whoosh', 'whoosh1', 'whoosh2', 'win']);

class Sound {
  constructor() {
    this.sfx = get(KEY_SFX, true);
    this.music = get(KEY_MUSIC, true);
    this.ctx = null; this.buffers = {}; this.loading = {};
    this.unlocked = false;
    this.musicEl = null;
    this.lastAt = {};
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
  }
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
    if (this.music) this.startMusic();
    for (const n of ['button', 'cardSlide1', 'chips1', 'multhit1', 'card1', 'coin3', 'paper1']) this.load(n);
  }
  load(name) {
    if (!this.ctx || this.buffers[name] || this.loading[name]) return this.loading[name];
    this.loading[name] = fetch(SOUNDS[name] ? SOUNDS[name].src : assetUrl('sounds/' + name + '.ogg')).then((r) => r.arrayBuffer())
      .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
      .then((buf) => { this.buffers[name] = buf; return buf; }).catch(() => null);
    return this.loading[name];
  }
  /** play(name, pitch=1, vol=1) — name may be a Balatro sound id. */
  play(name, pitch = 1, vol = 1) {
    if (!this.sfx || !this.ctx || !name) return;
    if (!KNOWN.has(name) && !SOUNDS[name]) { const m = /^(crumple|coin|glass|whoosh)$/.exec(name); if (m) name = name + '1'; else return; }
    const now = performance.now();
    if (now - (this.lastAt[name] || 0) < 35) return; // de-dupe bursts
    this.lastAt[name] = now;
    const go = (buf) => {
      if (!buf) return;
      const s = this.ctx.createBufferSource(); s.buffer = buf;
      s.playbackRate.value = Math.max(0.3, Math.min(3, pitch || 1));
      const g = this.ctx.createGain(); g.gain.value = Math.max(0, Math.min(1.5, vol == null ? 1 : vol));
      s.connect(g); g.connect(this.master); s.start();
    };
    if (this.buffers[name]) go(this.buffers[name]); else { const p = this.load(name); if (p) p.then(go); }
  }
  startMusic() {
    if (!this.unlocked) return;
    const src = this.track && SOUNDS[this.track] ? SOUNDS[this.track].src : assetUrl('sounds/music1.ogg');
    if (this.musicEl && this.musicEl.dataset.src !== src) { this.musicEl.pause(); this.musicEl = null; }
    if (!this.musicEl) {
      this.musicEl = new Audio(src);
      this.musicEl.dataset.src = src;
      this.musicEl.loop = true; this.musicEl.volume = 0.32;
    }
    this.musicEl.play().catch(() => {});
  }
  /** A mod music track (registry SOUNDS key, from the run view's `music`) or null for the base loop. */
  setTrack(key) {
    key = key && SOUNDS[key] ? key : null;
    if (key === (this.track || null)) return;
    this.track = key;
    if (this.music && this.unlocked) this.startMusic();
  }
  stopMusic() { if (this.musicEl) this.musicEl.pause(); }
  setSfx(on) { this.sfx = !!on; put(KEY_SFX, this.sfx); }
  setMusic(on) { this.music = !!on; put(KEY_MUSIC, this.music); if (on) this.startMusic(); else this.stopMusic(); }
}
export const sound = new Sound();
