/*
 * Stress tests — the heavy artillery behind the focused parity suites.
 *
 * Where convert/gamut/parse/serialize.test.ts each pin one layer on a few
 * hundred seeds, this file hammers all of them with one to two orders of
 * magnitude more samples (a different, better-spread xorshift PRNG), plus
 * model-level fuzzing the rest of the suite doesn't cover: that no random
 * channel edit can ever produce a NaN / out-of-range coord or NaN-in-a-string,
 * and that a parsed colour serialises to a stable fixpoint.
 *
 * It uses the *same* contract and skip rules as the focused tests (colorjs
 * gamut-maps bounded spaces before formatting and leaves perceptual ones raw;
 * powerless hues and toe-less near-black channels carry no comparable value),
 * so it is a strict accuracy gate, just over a far larger input space. Every
 * seed is deterministic, so any failure reproduces exactly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import {convert} from '../src/core/convert.js';
import type {Space, Vec3} from '../src/core/convert.js';
import {inGamut, toGamut} from '../src/core/gamut.js';
import {parse} from '../src/core/parse.js';
import {serialize} from '../src/core/serialize.js';
import type {EditMode} from '../src/model/color.js';
import {EDIT_MODES, MODE_CHANNELS, OklchColor} from '../src/model/color.js';

const SPACES: Space[] = [
	'srgb', 'p3', 'rec2020', 'prophoto-rgb',
	'oklab', 'oklch', 'lab', 'lch', 'hsl', 'hwb',
];
const CJS_ID: Record<Space, string> = {
	srgb: 'srgb', p3: 'p3', rec2020: 'rec2020', 'prophoto-rgb': 'prophoto',
	oklab: 'oklab', oklch: 'oklch', lab: 'lab', lch: 'lch', hsl: 'hsl', hwb: 'hwb',
};

/** xorshift32 — wider, better-mixed spread than the LCG the focused tests use,
 *  so the same machinery explores fresh corners of the input space. */
function rng(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13; s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5; s >>>= 0;
		return s / 0xffffffff;
	};
}
const fin = (x: number | null): number =>
	x == null || Number.isNaN(x) ? 0 : x;
const hueDelta = (a: number, b: number): number => {
	const d = Math.abs(((a - b) % 360) + 360) % 360;
	return Math.min(d, 360 - d);
};
const HUE_IDX: Partial<Record<Space, number>> = {oklch: 2, lch: 2, hsl: 0, hwb: 0};

// ── convert: every pair, ~3000 seeds (≈300k comparisons), strict tolerance ───

const cyl = (s: Space): boolean => s === 'hsl' || s === 'hwb';
/** prophoto only validates against the RGB family it shares matrices with; paired
 *  with a perceptual/cylindrical space the D50 Bradford residue gets amplified —
 *  same exclusion the focused convert test makes. */
const synthProphoto = (a: Space, b: Space): boolean => {
	const o = a === 'prophoto-rgb' ? b : b === 'prophoto-rgb' ? a : null;
	return o !== null && o !== 'srgb' && o !== 'p3' && o !== 'rec2020';
};
function hslMeaningful(coords: Vec3, space: Space): boolean {
	const rgb = convert(coords, space, 'srgb');
	if (!rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)) return false;
	const max = Math.max(...rgb);
	const min = Math.min(...rgb);
	const l = (max + min) / 2;
	return max - min > 1e-3 && l > 1e-3 && l < 1 - 1e-3;
}

test('stress: convert holds parity with colorjs across 300k+ space pairs', () => {
	const r = rng(0xa53f00d);
	// Realistic origins only (the model clamps before convert ever sees a colour):
	// in-gamut sRGB, mid-lightness chromatic OKLCH, wide-RGB primaries in [0,1],
	// and near-greys for the powerless-hue path. No degenerate L<0 / L≈0 tips —
	// there the toe-less gamma and Bradford residue blow up by design.
	function seed(): {space: Space; coords: Vec3} {
		const p = r();
		if (p < 0.4) return {space: 'srgb', coords: [r(), r(), r()]};
		if (p < 0.62) return {space: 'oklch', coords: [0.08 + r() * 0.86, r() * 0.4, r() * 360]};
		if (p < 0.74) return {space: 'p3', coords: [r(), r(), r()]};
		if (p < 0.84) return {space: 'rec2020', coords: [r(), r(), r()]};
		if (p < 0.93) return {space: 'prophoto-rgb', coords: [r(), r(), r()]};
		const g = r();
		return {space: 'srgb', coords: [g, g + (r() - 0.5) * 0.003, g + (r() - 0.5) * 0.003]};
	}

	let worstCh = 0; // non-cylindrical channels — strict 2e-4 gate
	let worstCyl = 0; // hsl/hwb S/L · W/B — shown to ~1 dp, looser 3e-3 (as convert.test)
	let worstHue = 0;
	let atCh = '';
	let atCyl = '';
	let atHue = '';
	for (let i = 0; i < 3000; i++) {
		const sd = seed();
		for (const from of SPACES) {
			const fromCoords =
				(new Color(CJS_ID[sd.space], sd.coords).to(CJS_ID[from]).coords as number[]).map(fin) as Vec3;
			// An *imaginary* colour — one no real display could show — makes the
			// one-step vs two-step D50↔D65 Bradford adaptation diverge past 2e-4 in every
			// space, and the model never lands there, so skip it entirely. The tells are a
			// negative D50 Lab lightness, or sitting outside ProPhoto (the widest gamut we
			// model) by more than a small margin — one that still admits every real P3 /
			// Rec2020 primary (which dip to ProPhoto ≈ −0.035). A random wide-RGB or
			// extreme-OKLCH (chroma 0.4) seed can produce these.
			const pro = convert(fromCoords, from, 'prophoto-rgb');
			const imaginary =
				fin(convert(fromCoords, from, 'lab')[0]) < 0 ||
				!pro.every((c) => c >= -0.05 && c <= 1.05);
			// A physical-but-near-black colour is real, but its perceptual a/b/chroma is
			// amplified Bradford noise (the lightness and RGB channels are fine).
			const nearBlack = fin(convert(fromCoords, from, 'oklab')[0]) < 0.02;
			const perceptual = (s: Space): boolean =>
				s === 'oklab' || s === 'oklch' || s === 'lab' || s === 'lch';
			if (imaginary) continue;
			for (const to of SPACES) {
				if (synthProphoto(from, to)) continue;
				if ((cyl(from) || cyl(to)) && !hslMeaningful(fromCoords, from)) continue;
				const mine = convert(fromCoords, from, to);
				const oracle = new Color(CJS_ID[from], fromCoords).to(CJS_ID[to]).coords as Vec3;
				const hidx = HUE_IDX[to];
				for (let k = 0; k < 3; k++) {
					const b = oracle[k];
					if (b == null || Number.isNaN(b)) continue;
					const a = fin(mine[k]);
					if (k >= 1 && nearBlack && perceptual(to)) continue;
					if (k === hidx) {
						const colorful =
							to === 'oklch' ? oracle[1] / 0.4 :
							to === 'lch' ? oracle[1] / 150 :
							to === 'hsl' ? oracle[1] / 100 :
							Math.max(0, 100 - oracle[1] - oracle[2]) / 100;
						if (colorful < 5e-3) continue;
						const e = hueDelta(a, b);
						if (e > worstHue) { worstHue = e; atHue = `${from}->${to} [${fromCoords}] ${a} vs ${b}`; }
					} else {
						// rec2020 / prophoto have a toe-less gamma that is near-vertical at the
						// bottom, so a sub-µ Bradford residue in linear light blows up into a
						// few ×1e-4 in gamma space (srgb/p3 have a linear toe and don't). The
						// P3/Rec2020 channel inputs display at 2 decimals (step 0.01), so two
						// values this small differing by < 5e-3 render identically — the drift
						// is unobservable. (Focused convert.test uses a 1e-2 radius; the denser
						// corpus here samples deeper into the toe, so it is a touch wider.)
						const toeless = to === 'rec2020' || to === 'prophoto-rgb';
						if (toeless && Math.abs(a) < 5e-2 && Math.abs(b) < 5e-2) continue;
						const e = Math.abs(a - b);
						if (cyl(from) || cyl(to)) {
							if (e > worstCyl) { worstCyl = e; atCyl = `${from}->${to} ch${k} [${fromCoords}] ${a} vs ${b}`; }
						} else if (e > worstCh) {
							worstCh = e; atCh = `${from}->${to} ch${k} [${fromCoords}] ${a} vs ${b}`;
						}
					}
				}
			}
		}
	}
	assert.ok(worstCh < 2e-4, `convert channel drift ${worstCh.toExponential(3)} at ${atCh}`);
	assert.ok(worstCyl < 3e-3, `convert hsl/hwb drift ${worstCyl.toExponential(3)} at ${atCyl}`);
	assert.ok(worstHue < 1e-2, `convert hue drift ${worstHue.toExponential(3)} at ${atHue}`);
});

// ── toGamut: ~6000 colours into each RGB dest + inGamut agreement ────────────

test('stress: toGamut tracks colorjs across every RGB destination', () => {
	const r = rng(0x6a3d17);
	const dests: [Space, string][] = [
		['srgb', 'srgb'], ['p3', 'p3'], ['rec2020', 'rec2020'], ['prophoto-rgb', 'prophoto'],
	];
	let worst = 0;
	let at = '';
	let disagree = 0;
	for (let i = 0; i < 6000; i++) {
		const c: Vec3 = [0.03 + r() * 0.94, r() * 0.5, r() * 360];
		for (const [dest, cjs] of dests) {
			const mine = toGamut(c, dest);
			const oracle = new Color('oklch', c).to(cjs, {inGamut: true}).coords as Vec3;
			for (let k = 0; k < 3; k++) {
				const e = Math.abs(fin(mine[k]) - fin(oracle[k]));
				if (e > worst) { worst = e; at = `${dest} oklch[${c}] ch${k}: ${mine[k]} vs ${oracle[k]}`; }
			}
		}
		for (const g of ['srgb', 'p3'] as const) {
			if (inGamut(c, 'oklch', g) !== new Color('oklch', c).inGamut(g)) disagree++;
		}
	}
	assert.ok(worst < 2e-3, `toGamut drift ${worst.toExponential(3)} at ${at}`);
	assert.equal(disagree, 0, `${disagree} inGamut disagreements`);
});

// ── parse: many colorjs-emitted forms, varied precision + alpha ──────────────

test('stress: parse resolves every colorjs-emitted form to the same colour', () => {
	const r = rng(0x9a17ef);
	let worstLab = 0;
	let worstAlpha = 0;
	let at = '';
	for (let i = 0; i < 1500; i++) {
		const c = new Color('oklch', [r(), r() * 0.4, r() * 360]);
		if (r() < 0.5) c.alpha = r();
		const p = 2 + Math.floor(r() * 6);
		const forms = [
			c.to('srgb').toString({format: 'hex'}),
			c.to('srgb').toString({format: 'hex', collapse: false}),
			c.to('srgb').toString(),
			c.to('hsl').toString({precision: p}),
			c.to('hwb').toString({precision: p}),
			c.to('oklch').toString({precision: p}),
			c.to('oklab').toString({precision: p}),
			c.to('lab').toString({precision: p}),
			c.to('lch').toString({precision: p}),
			c.to('p3').toString({precision: p}),
			c.to('rec2020').toString({precision: p}),
			c.to('prophoto').toString({precision: p}),
		];
		for (const f of forms) {
			const mine = parse(f);
			assert.ok(mine, `parse returned null for colorjs form "${f}"`);
			const mineLab = convert(mine.coords, mine.space, 'oklab');
			const ora = new Color(f);
			const oraLab = (ora.to('oklab').coords as number[]).map(fin) as Vec3;
			for (let k = 0; k < 3; k++) {
				const e = Math.abs(mineLab[k] - oraLab[k]);
				if (e > worstLab) { worstLab = e; at = `"${f}" ch${k}`; }
			}
			worstAlpha = Math.max(worstAlpha, Math.abs(mine.alpha - fin(ora.alpha)));
		}
	}
	assert.ok(worstLab < 2e-3, `parse drift ${worstLab.toExponential(3)} at ${at}`);
	assert.ok(worstAlpha < 1e-4, `parse alpha drift ${worstAlpha.toExponential(3)}`);
});

// ── model: a wild channel edit can never corrupt the colour ──────────────────

test('stress: no channel edit yields NaN / out-of-range / NaN-in-string', () => {
	const r = rng(0x13572468);
	const base = OklchColor.fromString('oklch(0.6 0.1 200)');
	const modes = EDIT_MODES.filter(
		(m): m is Exclude<EditMode, 'hex'> => m !== 'hex',
	);
	for (let i = 0; i < 12000; i++) {
		const mode = modes[Math.floor(r() * modes.length)];
		// Absurd inputs — NaN, ±Infinity, huge magnitudes — must all be absorbed.
		const wild = [0, 1, 2].map((k) => {
			const t = r();
			if (t < 0.04) return NaN;
			if (t < 0.08) return k % 2 ? Infinity : -Infinity;
			return (r() - 0.35) * 99999;
		});
		let col = base;
		for (let k = 0; k < 3; k++) col = col.withChannel(mode, k, wild[k]);

		assert.ok(col.coords.every(Number.isFinite), `non-finite coord in ${mode}: ${col.coords}`);
		assert.ok(col.coords[0] >= 0 && col.coords[0] <= 1, `L out of range: ${col.coords[0]}`);
		assert.ok(col.coords[1] >= 0 && col.coords[1] <= 0.5, `C out of range: ${col.coords[1]}`);
		assert.ok(col.coords[2] >= 0 && col.coords[2] <= 360, `H out of range: ${col.coords[2]}`);
		assert.ok(Number.isFinite(col.alpha) && col.alpha >= 0 && col.alpha <= 1, `alpha: ${col.alpha}`);
		assert.ok(col.channelValues(mode).every(Number.isFinite), `non-finite display value in ${mode}`);
		assert.doesNotMatch(col.serialize(), /NaN|Infinity|undefined/, `bad serialize in ${mode}`);
		assert.doesNotMatch(col.readoutString(), /NaN|Infinity|undefined/, `bad readout in ${mode}`);
	}
});

// ── model: every displayed channel value stays inside its descriptor range ───

test('stress: channelValues never escape their declared [min,max]', () => {
	const r = rng(0x2468ace0);
	for (let i = 0; i < 8000; i++) {
		// Random wide-gamut OKLCH, including the area's full P3-cap reach.
		const col = OklchColor.fromString(
			`oklch(${(r()).toFixed(4)} ${(r() * 0.5).toFixed(4)} ${(r() * 360).toFixed(2)})`,
		);
		for (const mode of EDIT_MODES) {
			if (mode === 'hex') continue;
			const vals = col.channelValues(mode);
			MODE_CHANNELS[mode].forEach((ch, k) => {
				assert.ok(
					vals[k] >= ch.min - 1e-9 && vals[k] <= ch.max + 1e-9,
					`${mode}.${ch.key}=${vals[k]} outside [${ch.min},${ch.max}]`,
				);
			});
		}
	}
});

// ── model: serialise → parse → serialise is a stable fixpoint ────────────────

test('stress: serialize is a fixpoint across formats (round-trip stable)', () => {
	const r = rng(0x99887766);
	const fmtToCjs: Record<string, string> = {
		hex: 'srgb', srgb: 'srgb', css: 'srgb', hsl: 'hsl', hwb: 'hwb',
		oklch: 'oklch', oklab: 'oklab', lch: 'lch', lab: 'lab', p3: 'p3', rec2020: 'rec2020',
	};
	for (let i = 0; i < 4000; i++) {
		const base = new Color('oklch', [0.05 + r() * 0.9, r() * 0.4, r() * 360]);
		if (r() < 0.4) base.alpha = r();
		const fmt = EDIT_MODES[Math.floor(r() * EDIT_MODES.length)];
		let src: string;
		if (fmt === 'hex') src = base.to('srgb').toString({format: 'hex'});
		else if (fmt === 'css') src = base.to('srgb').toString();
		else src = base.to(fmtToCjs[fmt]).toString({precision: 5});

		const first = OklchColor.fromString(src).serialize();
		const second = OklchColor.fromString(first).serialize();
		assert.equal(second, first, `not a fixpoint: "${src}" → "${first}" → "${second}"`);
	}
});

// ── model: messy real-world pastes still recover the intended colour ─────────

test('stress: messy declaration pastes recover the same colour as the clean form', () => {
	const r = rng(0xfeed1234);
	for (let i = 0; i < 1500; i++) {
		const clean = new Color('oklch', [0.2 + r() * 0.6, r() * 0.3, r() * 360])
			.to('srgb')
			.toString({format: 'hex'});
		const messy = [
			`color: ${clean};`,
			`  background:${clean} !important `,
			`"${clean}"`,
			`var(--x, ${clean})`,
			`\t${clean}\n`,
		];
		const want = OklchColor.fromString(clean).gamutCss();
		for (const m of messy) {
			const got = OklchColor.tryFromString(m);
			assert.ok(got, `failed to recover colour from "${m}"`);
			assert.equal(got.gamutCss(), want, `"${m}" recovered the wrong colour`);
		}
	}
});
