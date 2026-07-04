// dialog.js — GBA-style text box for signs, NPC chatter, and trainer quotes.
import { VIEW_W, VIEW_H } from './engine.js';

const WRAP = 36;

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
	}

	get blocking() { return this.pages != null; }

	key(k) {
		if (!this.pages) return;
		if (k === 'z' || k === 'Enter' || k === 'x') {
			this.idx++;
			if (this.idx >= this.pages.length) {
				const cb = this.onClose;
				this.pages = null;
				cb?.();
			}
		}
	}

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
		const page = this.pages[this.idx];
		page.forEach((l, i) => ctx.fillText(l, 12, VIEW_H - 28 + i * 12));
		if (this.idx < this.pages.length - 1) ctx.fillText('▼', VIEW_W - 18, VIEW_H - 10);
	}
}
