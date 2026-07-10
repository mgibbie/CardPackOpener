// dialog.js — GBA-style text box for signs, NPC chatter, and trainer quotes.
import { VIEW_W, VIEW_H } from './engine.js';
import * as Settings from './settings.js';

const WRAP = 36;

// characters shown so far on a page, given its total length
function pageLen(page) { return page.reduce((s, l) => s + l.length, 0); }

function paginate(text) {
	// paragraphs (blank-line separated) become pages; long lines wrap
	const pages = [];
	for (const para of text.split(/\n\s*\n/)) {
		const lines = [];
		for (const raw of para.split('\n')) {
			let line = '';
			for (const w of raw.split(' ')) {
				if ((line + w).length > WRAP && line) { lines.push(line.trimEnd()); line = ''; }
				line += w + ' ';
			}
			lines.push(line.trimEnd());
		}
		for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
	}
	return pages.length ? pages : [['...']];
}

export class Dialog {
	constructor() {
		this.pages = null;
		this.idx = 0;
		this.onClose = null;
	}

	open(text, onClose) {
		this.pages = paginate(text);
		this.idx = 0;
		this.onClose = onClose || null;
		this.revealed = 0; // chars shown on the current page (typewriter)
	}

	get blocking() { return this.pages != null; }

	// advance the typewriter reveal
	update(dt) {
		if (!this.pages) return;
		const cps = Settings.charsPerSec();
		if (cps === Infinity) { this.revealed = pageLen(this.pages[this.idx]); return; }
		this.revealed = Math.min(pageLen(this.pages[this.idx]), (this.revealed || 0) + cps * dt);
	}

	key(k) {
		if (!this.pages) return;
		if (k === 'z' || k === 'Enter' || k === 'x') {
			// first press reveals the rest of the page instead of advancing
			const full = pageLen(this.pages[this.idx]);
			if (k !== 'x' && (this.revealed || 0) < full) { this.revealed = full; return; }
			this.idx++;
			this.revealed = 0;
			if (this.idx >= this.pages.length) {
				const cb = this.onClose;
				this.pages = null;
				cb?.(k); // pass the closing key so prompts can tell Z (yes) from X (no)
			}
		}
	}

	// slice a page's lines to the currently-revealed character budget
	revealedLines(page) {
		let budget = Math.floor(this.revealed ?? pageLen(page));
		return page.map(l => { const s = l.slice(0, budget); budget = Math.max(0, budget - l.length); return s; });
	}
	get pageComplete() { return !this.pages || (this.revealed ?? 0) >= pageLen(this.pages[this.idx]); }

	draw(ctx) {
		if (!this.pages) return;
		ctx.fillStyle = '#f8f8e0';
		ctx.fillRect(4, VIEW_H - 42, VIEW_W - 8, 38);
		ctx.strokeStyle = '#28283a';
		ctx.lineWidth = 2;
		ctx.strokeRect(5, VIEW_H - 41, VIEW_W - 10, 36);
		ctx.lineWidth = 1;
		ctx.fillStyle = '#28283a';
		ctx.font = '8px monospace';
		const page = this.revealedLines(this.pages[this.idx]);
		page.forEach((l, i) => ctx.fillText(l, 12, VIEW_H - 28 + i * 12));
		if (this.pageComplete && this.idx < this.pages.length - 1) ctx.fillText('▼', VIEW_W - 18, VIEW_H - 10);
	}

	// full-resolution text box: same GBA cream styling, crisp pixel font
	drawHi(ctx, W, H) {
		if (!this.pages) return;
		const u = H / 480;
		const bh = 108 * u, y = H - bh - 10 * u;
		ctx.fillStyle = '#f8f8e0';
		ctx.beginPath(); ctx.roundRect(12 * u, y, W - 24 * u, bh, 10 * u); ctx.fill();
		ctx.strokeStyle = '#28283a';
		ctx.lineWidth = 4 * u;
		ctx.beginPath(); ctx.roundRect(15 * u, y + 3 * u, W - 30 * u, bh - 6 * u, 8 * u); ctx.stroke();
		ctx.fillStyle = '#28283a';
		ctx.font = `${Math.round(21 * u)}px m6x11plus, monospace`;
		this.revealedLines(this.pages[this.idx]).forEach((l, i) => ctx.fillText(l, 34 * u, y + 42 * u + i * 30 * u));
		if (this.pageComplete && this.idx < this.pages.length - 1) ctx.fillText('▼', W - 52 * u, y + bh - 16 * u);
	}
}
