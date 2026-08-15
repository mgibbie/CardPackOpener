// codec.js — compact, shareable deck codes.
//
// Encodes a deck ({classId, cards:[ids], commander, companion}) to a short string
// and back. The payload is a compact "cls~cmd~cmp~id*count|id*count|..." string —
// card/class ids never contain ~ * | . so those are safe delimiters — then gzipped
// when the browser/runtime has CompressionStream (roughly halves it) and base64url'd.
// Prefix tells the decoder which: MPCKG1. = gzipped, MPCK1. = raw. Async because
// (de)compression is stream-based; both paths are node-safe (globals in Node 18+),
// so the round-trip is unit-tested.

const b64urlFromBytes = bytes => {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const bytesFromB64url = str => {
	const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
	const u = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
	return u;
};

function buildPayload({ classId, cards, commander, companion }) {
	const counts = {};
	for (const id of cards || []) counts[id] = (counts[id] || 0) + 1;
	const body = Object.entries(counts).map(([id, n]) => `${id}*${n}`).join('|');
	return `${classId || ''}~${commander || '-'}~${companion || '-'}~${body}`;
}
function parsePayload(payload) {
	const i1 = payload.indexOf('~'), i2 = payload.indexOf('~', i1 + 1), i3 = payload.indexOf('~', i2 + 1);
	if (i1 < 0 || i2 < 0 || i3 < 0) return null;
	const classId = payload.slice(0, i1);
	const cmd = payload.slice(i1 + 1, i2), cmp = payload.slice(i2 + 1, i3);
	const cards = [];
	for (const part of payload.slice(i3 + 1).split('|')) {
		if (!part) continue;
		const star = part.lastIndexOf('*');
		const id = star < 0 ? part : part.slice(0, star);
		const n = star < 0 ? 1 : Math.max(1, Math.min(40, parseInt(part.slice(star + 1), 10) || 1));
		for (let k = 0; k < n; k++) cards.push(id);
	}
	return { classId, cards, commander: cmd && cmd !== '-' ? cmd : null, companion: cmp && cmp !== '-' ? cmp : null };
}

// stream gzip/gunzip a Uint8Array -> Uint8Array. On bad input the transform errors
// its readable; the reader loop rejects and the caller's try/catch turns it into a
// null decode. Writer-side rejections are swallowed so they don't go unhandled.
async function stream(bytes, mode) {
	const Ctor = mode === 'gzip' ? CompressionStream : DecompressionStream;
	const s = new Ctor('gzip');
	const w = s.writable.getWriter();
	w.write(bytes).catch(() => {});
	w.close().catch(() => {});
	const reader = s.readable.getReader();
	const chunks = [];
	for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
	let len = 0; for (const c of chunks) len += c.length;
	const out = new Uint8Array(len); let off = 0;
	for (const c of chunks) { out.set(c, off); off += c.length; }
	return out;
}

export async function encodeDeck(deck) {
	const payload = new TextEncoder().encode(buildPayload(deck));
	if (typeof CompressionStream !== 'undefined') {
		try { return 'MPCKG1.' + b64urlFromBytes(await stream(payload, 'gzip')); } catch { /* fall through */ }
	}
	return 'MPCK1.' + b64urlFromBytes(payload);
}

export async function decodeDeck(code) {
	try {
		code = (code || '').trim();
		if (code.startsWith('MPCKG1.')) return parsePayload(new TextDecoder().decode(await stream(bytesFromB64url(code.slice(7)), 'gunzip')));
		if (code.startsWith('MPCK1.')) return parsePayload(new TextDecoder().decode(bytesFromB64url(code.slice(6))));
		return null;
	} catch { return null; }
}
