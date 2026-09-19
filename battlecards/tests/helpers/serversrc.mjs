// serversrc.mjs — pull live pieces of server/mp.mjs into a test.
//
// mp.mjs can't be imported in Node (attribute-less JSON imports), so the unit
// tests extract the self-contained bits from source and run them for real. That
// keeps them honest, but it means a refactor in mp.mjs can silently break the
// extraction: #508 split rateLimit into a memory fast path (rateLimitMem, gated
// by DURABLE_BUCKETS) and three suites started throwing
// "DURABLE_BUCKETS is not defined". Centralising the recipe here so the next
// refactor is one fix, not three.

// Pull `function <name>` / `async function <name>` out by brace matching.
export function extractFn(src, name) {
	const m = new RegExp('(?:async )?function ' + name + '\\s*\\(').exec(src);
	if (!m) throw new Error('serversrc: function not found: ' + name);
	const i = m.index;
	let depth = 0, started = false, k = i;
	for (; k < src.length; k++) {
		if (src[k] === '{') { depth++; started = true; }
		else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } }
	}
	return src.slice(i, k);
}

// Pull a single-line `const <name> = ...;` declaration.
export function extractConst(src, name) {
	const m = new RegExp('const ' + name + '\\s*=[^\\n]+').exec(src);
	if (!m) throw new Error('serversrc: const not found: ' + name);
	return m[0];
}

// The real rateLimit, with the module-level state it now depends on.
export function buildRateLimit(src) {
	const body = [
		extractConst(src, 'memBuckets'),
		extractFn(src, 'rateLimitMem'),
		extractConst(src, 'DURABLE_BUCKETS'),
		extractFn(src, 'rateLimit'),
		'return rateLimit;',
	].join('\n');
	return new Function(body)();
}
