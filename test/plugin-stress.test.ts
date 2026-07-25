/*
 * Stress tests for the plugin/DOM-layer contracts — the ones the colour-engine
 * suites don't reach.
 *
 * The focused suites pin behaviour on hand-picked strings. This file hammers the
 * same contracts with ~10⁴–10⁵ generated colours across every mode, alpha state
 * and output format, hunting for a case where the layers disagree:
 *
 *  - the write→accept loop (anything the writer emits must still be claimable),
 *  - accept↔reader agreement (accept must never claim what the reader throws on),
 *  - accept↔text-field separation (accept strict, the field forgiving),
 *  - asEdited() as a fixpoint (the clamp-on-edit contract both fields rely on),
 *  - hasAlpha stability (it drives whether the alpha row is mounted),
 *  - computeArea across pathological canvas sizes (the ImageData guard).
 *
 * Every seed is deterministic, so a failure reproduces exactly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {computeArea} from '../src/area-compute.js';
import type {Space} from '../src/core/convert.js';
import {
	type EditMode,
	EDIT_MODES,
	MODE_CHANNELS,
	OklchColor,
} from '../src/model/color.js';
import {OklchInputPlugin} from '../src/plugin.js';

const accepts = (v: unknown): boolean => OklchInputPlugin.accept(v, {}) !== null;
const read = (v: unknown): OklchColor =>
	// Mirrors binding.reader — it throws rather than returning null, which is
	// exactly the contract these tests are here to guard.
	OklchColor.fromString(String(v));

/** xorshift32 — same generator the colour-engine stress suite uses. */
function rng(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 0xffffffff;
	};
}

/**
 * A random colour, in a random mode, opaque or not.
 *
 * `lightness: 'safe'` keeps L in [0.05, 0.95] — the same range the colour-engine
 * stress suite uses when it asserts round-trip stability. In the degenerate tips
 * the colour is ~black or ~white in every space, so hue (and, in HWB, whiteness)
 * is powerless and carries no value a round-trip could preserve. The safety
 * contracts below — clamping, claimability, NaN-freedom — are still asserted over
 * the full range, because that is exactly where they have to hold.
 */
function randomColor(
	r: () => number,
	lightness: 'full' | 'safe' = 'full',
): OklchColor {
	const L = lightness === 'safe' ? 0.05 + r() * 0.9 : r();
	const base = OklchColor.fromString(
		`oklch(${L} ${r() * 0.4} ${r() * 360})`,
	).withFormat(EDIT_MODES[Math.floor(r() * EDIT_MODES.length)]);
	return r() < 0.4 ? base.withAlpha(r()) : base;
}

test('stress: everything the writer emits is still claimable by accept', () => {
	// The tightest loop in the plugin: writer → bound object → a fresh pane's
	// accept. If accept ever declines its own output, re-opening a pane over a
	// saved value silently downgrades the picker to a text input.
	const r = rng(0x5eed01);
	for (let i = 0; i < 20000; i++) {
		const s = randomColor(r).serialize();
		assert.ok(accepts(s), `writer emitted an unclaimable string: ${s}`);
		assert.ok(!/NaN|undefined|Infinity/.test(s), `bad token in output: ${s}`);
	}
});

test('stress: accept never claims a value the reader throws on', () => {
	// accept is the only gate in front of the reader, and the reader throws.
	// Anything accept lets through must therefore parse.
	const r = rng(0x5eed02);
	const candidates: string[] = [];
	for (let i = 0; i < 4000; i++) {
		const s = randomColor(r).serialize();
		candidates.push(s, s.toUpperCase(), ` ${s} `, s.replace(/\s+/g, '  '));
	}
	// Plus deliberately hostile shapes.
	candidates.push(
		...[
			'',
			' ',
			'#',
			'#1',
			'#12',
			'#12345',
			'#1234567',
			'#gggggg',
			'rgb()',
			'rgb(1)',
			'rgb(1 2)',
			'rgb(1 2 3 4)',
			'rgb(1,2)',
			'rgb(1,2,3,4,5)',
			'rgb(1 2 3 / 4 / 5)',
			'oklch(0.5 0.1)',
			'oklch(0.5 0.1 20 0.5)',
			'color(srgb 1 0)',
			'color(bogus 1 0 0)',
			'color(display-p3 1 0 0 0)',
			'hsl(none none none)',
			'lab(50% none 30)',
			'not-a-colour',
			'redd',
			'rgb(1e400 0 0)',
			'oklch(NaN 0 0)',
			'oklch(1e999 1e999 1e999)',
		],
	);
	for (const s of candidates) {
		if (!accepts(s)) {
			continue;
		}
		assert.doesNotThrow(
			() => read(s),
			`accept claimed a value the reader rejects: ${JSON.stringify(s)}`,
		);
	}
});

test('stress: accept stays strict where the text field stays forgiving', () => {
	// The two predicates are deliberately different. Whenever they disagree, it
	// must be because the string is a colour *embedded in other text* — never
	// because accept lost a colour the reader could have handled on its own.
	const r = rng(0x5eed03);
	const wrappers = [
		(s: string) => `color: ${s};`,
		(s: string) => `"${s}"`,
		(s: string) => `'${s}'`,
		(s: string) => `${s} !important`,
		(s: string) => `background:${s}`,
		(s: string) => `var(--x, ${s})`,
		(s: string) => `0 0 4px ${s}`,
		(s: string) => `linear-gradient(${s}, white)`,
	];
	let disagreements = 0;
	for (let i = 0; i < 4000; i++) {
		const bare = randomColor(r).serialize();
		const wrapped = wrappers[Math.floor(r() * wrappers.length)](bare);

		// The bare form: both must claim it.
		assert.ok(accepts(bare), `accept lost a bare colour: ${bare}`);
		assert.ok(OklchColor.isColorString(bare), `field lost a colour: ${bare}`);

		// The wrapped form: accept must decline. (The field may or may not recover
		// it — `extractColorString` is best-effort — but it must never be the one
		// that declines while accept claims.)
		assert.ok(!accepts(wrapped), `accept claimed embedded text: ${wrapped}`);
		if (OklchColor.isColorString(wrapped)) {
			disagreements++;
		}
	}
	// Sanity on the test itself: the forgiving path must actually be exercised,
	// or this is only asserting that both predicates reject everything.
	assert.ok(
		disagreements > 2000,
		`expected the text field to recover most wrapped colours, got ${disagreements}`,
	);
});

/**
 * Pre-existing serialisation artifacts, unrelated to anything these tests guard,
 * that let a written string re-serialise differently. All three are cosmetic and
 * all three reproduce identically on `main` (verified: 40/40000 either way), so
 * they are skipped rather than asserted — this file should fail only on a real
 * change, not on known cosmetic noise.
 *
 *  - **Alpha rounding.** Whether to print alpha is decided on the unrounded value
 *    but the printed value is rounded, so an alpha in (0.99995, 1) emits `/ 1`
 *    (or `ff` in hex), which re-reads as fully opaque and is then omitted.
 *  - **Powerless HWB hue.** Once whiteness + blackness reaches 100% the colour is
 *    grey, so its hue carries no information and need not survive a round-trip.
 *    (Whiteness can sit a hair below zero for an out-of-gamut colour, so the sum
 *    lands just under 100 — hence the tolerance.) Same "powerless hue" exemption
 *    the colour-engine suite already documents.
 */
function knownUnstableOutput(s: string): boolean {
	if (/\/ 1\)$/.test(s) || /^#[0-9a-f]{6}ff$/i.test(s)) {
		return true; // alpha rounded up to fully opaque
	}
	const hwb = /^hwb\(\s*[\d.+-]+\s+([\d.+-]+)%\s+([\d.+-]+)%/.exec(s);
	return !!hwb && parseFloat(hwb[1]) + parseFloat(hwb[2]) >= 99.9;
}

/** 0° and 360° are the same hue; hsl/hwb render it either way depending on the
 *  path in. Normalised rather than skipped — it is a notation difference, not a
 *  colour difference, so the comparison should see through it. */
const sameHue = (s: string): string => s.replace(/^(hsl|hwb)\(360\b/, '$1(0');

const NUM = /-?\d+(?:\.\d+)?/g;

/**
 * Do two serialised colours describe the same colour?
 *
 * Structure (function name, units, separators) must match *exactly* — that is the
 * part a regression would break. The numbers are compared to within one unit in
 * their last printed place, because an exact string fixpoint is not achievable:
 * the round-trip re-parses a decimal, converts through OKLCH and rounds again, so
 * a value sitting on a rounding boundary can land one digit either side
 * (`lab(… 0.2623 …)` ↔ `lab(… 0.2624 …)`). A real breakage moves numbers by far
 * more than one ULP, so this stays a tight gate.
 */
function sameColorString(a: string, b: string): boolean {
	if (a.replace(NUM, '#') !== b.replace(NUM, '#')) {
		return false; // different shape, not a rounding difference
	}
	const an = a.match(NUM) ?? [];
	const bn = b.match(NUM) ?? [];
	return an.every((tok, i) => {
		const dot = tok.indexOf('.');
		const ulp = dot < 0 ? 1 : 10 ** -(tok.length - dot - 1);
		return Math.abs(parseFloat(tok) - parseFloat(bn[i])) <= ulp * 1.5;
	});
}

test('stress: asEdited() settles immediately and stays claimable', () => {
	// The contract both text fields depend on: dropping the verbatim source and
	// re-serialising from the clamped coords must settle at once, and must produce
	// a string the plugin still claims.
	//
	// Note this is a *string* fixpoint, not a coordinate round-trip. Coordinates
	// cannot survive: `rgb()` and hex quantise to integer 0–255, p3/rec2020 to four
	// decimals, and hue is powerless near the achromatic axis — so re-reading
	// `rgb(0 1 1)` legitimately lands on a different OKLCH triple. The string is
	// the thing the binding actually carries, so the string is what must be stable.
	const r = rng(0x5eed04);
	let skipped = 0;
	for (let i = 0; i < 20000; i++) {
		const once = randomColor(r, 'safe').asEdited();
		const s1 = once.serialize();
		assert.ok(accepts(s1), `asEdited produced an unclaimable string: ${s1}`);
		assert.ok(!/NaN/.test(s1), `NaN in output: ${s1}`);
		// Idempotent on the object, unconditionally.
		assert.equal(once.asEdited().serialize(), s1, 'asEdited is not idempotent');
		// And stable through the binding round-trip.
		if (knownUnstableOutput(s1)) {
			skipped++;
			continue;
		}
		const s2 = read(s1).asEdited().serialize();
		assert.ok(
			sameColorString(sameHue(s1), sameHue(s2)),
			`not a fixpoint through the binding: ${s1} → ${s2}`,
		);
	}
	// Guard the guard: if the skip rule ever starts swallowing a large share of the
	// corpus, this test has quietly stopped testing anything.
	assert.ok(skipped < 200, `skip rule swallowed too much: ${skipped}/20000`);
});

test('stress: typed nonsense can never escape the clamp via a text field', () => {
	// The HEX-field regression, generalised: whatever is typed into either field,
	// the string that reaches the binding must describe the *clamped* colour.
	const r = rng(0x5eed05);
	for (let i = 0; i < 5000; i++) {
		const wild = `oklch(${(r() - 0.3) * 8} ${r() * 90000} ${(r() - 0.5) * 4000})`;
		const parsed = OklchColor.tryFromString(wild);
		if (!parsed) {
			continue;
		}
		const written = parsed.asEdited(); // what both fields now do
		const [L, C, H] = written.coords;
		assert.ok(L >= 0 && L <= 1, `L escaped: ${L}`);
		assert.ok(C >= 0 && C <= 0.5, `C escaped: ${C}`);
		assert.ok(H >= 0 && H <= 360, `H escaped: ${H}`);

		// The point of the fix: what reaches the binding is the *recomputed* string,
		// never the raw entry echoed back.
		const s = written.serialize();
		assert.notEqual(s, wild, `raw input reached the binding verbatim: ${wild}`);
		assert.ok(accepts(s), `clamped output is unclaimable: ${s}`);
		assert.ok(!/NaN/.test(s), `NaN in clamped output: ${s}`);

		// And re-reading it must land back inside the clamp — the value cannot
		// drift further out with each save/load cycle.
		const reread = read(s);
		assert.ok(reread.coords[0] >= 0 && reread.coords[0] <= 1);
		assert.ok(reread.coords[1] >= 0 && reread.coords[1] <= 0.5);
		assert.ok(reread.coords[2] >= 0 && reread.coords[2] <= 360);
	}
});

test('stress: hasAlpha is stable across mode switches', () => {
	// hasAlpha decides whether the alpha row is mounted. If a mode switch could
	// flip it, the row would appear/disappear on an unrelated interaction.
	const r = rng(0x5eed06);
	for (let i = 0; i < 5000; i++) {
		const c = randomColor(r);
		const want = c.hasAlpha;
		for (const m of EDIT_MODES) {
			assert.equal(
				c.withFormat(m).hasAlpha,
				want,
				`withFormat('${m}') flipped hasAlpha`,
			);
		}
		assert.equal(c.asEdited().hasAlpha, want, 'asEdited flipped hasAlpha');
		assert.equal(
			c.withAreaHue(r() * 360).hasAlpha,
			want,
			'withAreaHue flipped hasAlpha',
		);
		// withAlpha is the one deliberate way to acquire it.
		assert.equal(c.withAlpha(r()).hasAlpha, true);
	}
});

test('stress: every channel edit in every mode keeps the binding claimable', () => {
	// Walks the numeric inputs: for each mode, each channel, at its range
	// extremes and points between, the resulting binding string must survive the
	// writer → accept → reader loop.
	const r = rng(0x5eed07);
	const modes = EDIT_MODES.filter((m): m is Exclude<EditMode, 'hex'> => m !== 'hex');
	for (let i = 0; i < 3000; i++) {
		const mode = modes[Math.floor(r() * modes.length)];
		let c = randomColor(r).withFormat(mode);
		const chans = MODE_CHANNELS[mode];
		for (let k = 0; k < 3; k++) {
			const ch = chans[k];
			const pick = r();
			const v =
				pick < 0.2 ? ch.min : pick < 0.4 ? ch.max : ch.min + r() * (ch.max - ch.min);
			c = c.withChannel(mode, k, v);
		}
		const s = c.serialize();
		assert.ok(!/NaN/.test(s), `NaN in binding string: ${s} (mode ${mode})`);
		assert.ok(accepts(s), `channel edit produced an unclaimable string: ${s}`);
		assert.doesNotThrow(() => read(s), `reader rejects ${s}`);
	}
});

test('stress: computeArea is ImageData-safe or refuses at pathological sizes', () => {
	// The rAF guard now covers `new ImageData`, but the contract worth pinning is
	// the one underneath: whenever computeArea returns a *usable* plane, the
	// buffer length matches W×H×4 exactly (ImageData rejects a mismatch), and the
	// only planes it refuses are the degenerate zero-dimension ones.
	const r = rng(0x5eed08);
	const sizes: [number, number, number][] = [
		[0, 0, 1],
		[1, 1, 1],
		[2, 2, 1],
		[3, 3, 1],
		[4, 4, 1],
		[1, 200, 1],
		[320, 1, 1],
		[320, 200, 0.5],
		[320, 200, 1],
		[320, 200, 2],
		[320, 200, 3],
		[2000, 1200, 2],
	];
	for (let i = 0; i < 60; i++) {
		sizes.push([r() * 12, r() * 12, [0.5, 1, 1.5, 2, 3][Math.floor(r() * 5)]]);
	}
	const stretches: Space[] = ['srgb', 'p3', 'rec2020'];
	for (const [cssW, cssH, dpr] of sizes) {
		for (const stretch of stretches) {
			const a = computeArea({
				hue: r() * 360,
				cssW,
				cssH,
				dpr,
				supportsP3: r() < 0.5,
				stretch,
			});
			assert.equal(
				a.pixels.length,
				a.W * a.H * 4,
				`buffer/dimension mismatch at ${cssW}×${cssH}@${dpr}`,
			);
			assert.ok(a.W >= 0 && a.H >= 0);
			assert.ok(
				a.chromaCurve.every((v) => Number.isFinite(v) && v >= 0),
				'chroma curve went non-finite',
			);
			for (const b of a.boundaries) {
				assert.ok(
					b.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
					'boundary point went non-finite',
				);
			}
			// A zero dimension is precisely the case `new ImageData` rejects — and
			// precisely the case the paint guard now catches.
			if (a.W === 0 || a.H === 0) {
				assert.ok(cssW * dpr < 2 || cssH * dpr < 2, 'unexpected empty plane');
			}
		}
	}
});
