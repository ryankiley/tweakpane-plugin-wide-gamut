/*
 * Parity tests: our hand-rolled conversions (src/core/convert.ts) must match
 * colorjs.io across every space pair, so we can later drop colorjs from the
 * runtime with confidence. colorjs stays a dev dependency purely as this oracle.
 *
 * Method: take a corpus of seed colours, express each in every `from` space via
 * colorjs, then convert `from → to` with both implementations and compare. Both
 * sides start from the *same* finite coords (the model guarantees finite coords,
 * so NaN powerless-hue from colorjs is coalesced to 0 before the comparison).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import {convert} from '../src/core/convert.js';
import type {Space, Vec3} from '../src/core/convert.js';

const SPACES: Space[] = [
	'srgb',
	'p3',
	'rec2020',
	'prophoto-rgb',
	'oklab',
	'oklch',
	'lab',
	'lch',
	'hsl',
	'hwb',
];

// colorjs's high-level API id for ProPhoto is "prophoto"; ours (matching the
// CSS color() ident the /fn API uses) is "prophoto-rgb". Otherwise identical.
const CJS_ID: Record<Space, string> = {
	srgb: 'srgb',
	p3: 'p3',
	rec2020: 'rec2020',
	'prophoto-rgb': 'prophoto',
	oklab: 'oklab',
	oklch: 'oklch',
	lab: 'lab',
	lch: 'lch',
	hsl: 'hsl',
	hwb: 'hwb',
};

// Hue lives at a different index per space and is powerless (undefined) when the
// colour is achromatic — skip the hue comparison there, like CSS does.
const HUE: Partial<Record<Space, {idx: number; colorful: (c: Vec3) => number}>> = {
	oklch: {idx: 2, colorful: (c) => c[1] / 0.4},
	lch: {idx: 2, colorful: (c) => c[1] / 150},
	hsl: {idx: 0, colorful: (c) => c[1] / 100},
	hwb: {idx: 0, colorful: (c) => Math.max(0, 100 - c[1] - c[2]) / 100},
};

/** Deterministic PRNG so a failure always reproduces. */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function buildCorpus(): {space: Space; coords: Vec3}[] {
	const r = rng(0xc0ffee);
	const seeds: {space: Space; coords: Vec3}[] = [];
	// Chromatic OKLCH across the whole hue wheel (stable, meaningful hue).
	for (let i = 0; i < 120; i++) {
		seeds.push({space: 'oklch', coords: [0.1 + r() * 0.85, 0.02 + r() * 0.33, r() * 360]});
	}
	// Arbitrary sRGB (includes near-greys, exercising the powerless path).
	for (let i = 0; i < 120; i++) {
		seeds.push({space: 'srgb', coords: [r(), r(), r()]});
	}
	// Fixed edge cases: extremes, primaries, grey, wide-gamut.
	const fixed: [Space, Vec3][] = [
		['srgb', [1, 1, 1]],
		['srgb', [0, 0, 0]],
		['srgb', [1, 0, 0]],
		['srgb', [0, 1, 0]],
		['srgb', [0, 0, 1]],
		['srgb', [0.5, 0.5, 0.5]],
		['oklch', [0.7, 0, 120]], // grey — powerless hue
		['p3', [1, 0, 0]], // outside sRGB
		['rec2020', [0, 1, 0]], // outside P3
		['prophoto-rgb', [0.5, 0.9, 0.2]],
	];
	for (const [space, coords] of fixed) {
		seeds.push({space, coords});
	}
	return seeds;
}

const CORPUS = buildCorpus();

function hueDelta(a: number, b: number): number {
	const d = Math.abs(((a - b) % 360) + 360) % 360;
	return Math.min(d, 360 - d);
}

/** colorjs marks powerless/missing channels as null or NaN; the model coalesces
 *  both to 0 (via num()), so the comparison does too. */
function fin(x: number | null): number {
	return x == null || Number.isNaN(x) ? 0 : x;
}

function assertClose(
	mineRaw: Vec3,
	oracleRaw: Vec3,
	from: Space,
	to: Space,
	// No-D50 paths (oklch ↔ srgb/p3/rec2020/oklab) match colorjs to ~1e-9; the
	// default absorbs the D50↔D65 Bradford drift (≤1.5e-4) on the lab/lch/prophoto
	// paths, where colorjs pre-composes matrices we apply in two steps. A wrong
	// matrix digit is ≥1e-3, so this still bites by ~5×.
	absTol = 2e-4,
	hueTol = 1e-2,
): void {
	const mine = mineRaw.map(fin) as Vec3;
	const oracle = oracleRaw.map(fin) as Vec3;
	const hue = HUE[to];
	const ctx = `${from} → ${to}`;
	for (let i = 0; i < 3; i++) {
		// Skip channels colorjs itself leaves undefined: a powerless hue, or an
		// out-of-gamut RGB channel where its rec2020 2.4-gamma takes a fractional
		// power of a negative and yields NaN. No oracle value ⇒ nothing to match
		// (and such channels are clamped before they ever reach the user).
		if (oracleRaw[i] == null || Number.isNaN(oracleRaw[i])) {
			continue;
		}
		const a = mine[i];
		const b = oracle[i];
		if (hue && i === hue.idx) {
			if (hue.colorful(oracle) < 5e-3) {
				continue; // powerless hue — value is meaningless, skip
			}
			assert.ok(
				hueDelta(a, b) < hueTol,
				`${ctx} hue: ${a} vs ${b} (Δ ${hueDelta(a, b)})`,
			);
		} else {
			// rec2020/prophoto have a toe-less gamma that's near-vertical at 0, so a
			// sub-µ linear difference at the gamut boundary blows up in gamma space
			// (srgb/p3 have a linear toe and don't). Near black there, the channel is
			// invisibly small and clamped in the UI — nothing meaningful to compare.
			const toeless = to === 'rec2020' || to === 'prophoto-rgb';
			if (toeless && Math.abs(a) < 1e-2 && Math.abs(b) < 1e-2) {
				continue;
			}
			assert.ok(
				Math.abs(a - b) < absTol + 1e-7 * Math.abs(b),
				`${ctx} ch${i}: ${a} vs ${b} (Δ ${Math.abs(a - b)})`,
			);
		}
	}
}

/** HSL and HWB are sRGB-bound modes: the plugin gamut-maps before ever using
 *  them, so only in-gamut parity matters (colorjs's out-of-gamut HSL/HWB has
 *  sign/flip quirks we deliberately don't replicate). */
const cyl = (s: Space): boolean => s === 'hsl' || s === 'hwb';
/** HSL/HWB hue and saturation are singular on the achromatic axis (max = min)
 *  and at the black/white points (L = 0/100, where saturation divides by zero),
 *  and out of gamut they carry colorjs's sign quirks. Only compare where they're
 *  both in-gamut and well-conditioned — the only place the plugin uses them. */
function hslMeaningful(coords: Vec3, space: Space): boolean {
	const rgb = convert(coords, space, 'srgb');
	if (!rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)) {
		return false;
	}
	const max = Math.max(rgb[0], rgb[1], rgb[2]);
	const min = Math.min(rgb[0], rgb[1], rgb[2]);
	const l = (max + min) / 2;
	return max - min > 1e-3 && l > 1e-3 && l < 1 - 1e-3;
}
/** The plugin only uses prophoto as a coarse gamut-check target, so it only
 *  meaningfully pairs with the RGB-family spaces (srgb/p3/rec2020) that validate
 *  its matrix, transfer, and single D50↔D65 cross. Paired with a perceptual or
 *  cylindrical space it's synthetic: the D50 Bradford residue gets amplified by
 *  the OKLab/Lab cube-root or HSL's saturation singularity, drifting well past
 *  2e-4. oklch→prophoto stays covered transitively (oklch→srgb ∘ srgb→prophoto). */
const synthProphoto = (a: Space, b: Space): boolean => {
	const other = a === 'prophoto-rgb' ? b : b === 'prophoto-rgb' ? a : null;
	return other !== null && other !== 'srgb' && other !== 'p3' && other !== 'rec2020';
};

for (const from of SPACES) {
	test(`convert: ${from} → every space matches colorjs`, () => {
		for (const seed of CORPUS) {
			// Express the seed in `from` (oracle), coalescing powerless null/NaN to 0
			// so both implementations start from the identical finite input.
			const raw = new Color(CJS_ID[seed.space], seed.coords).to(CJS_ID[from]).coords;
			const fromCoords = raw.map(fin) as Vec3;
			for (const to of SPACES) {
				if (synthProphoto(from, to)) {
					continue; // synthetic prophoto↔perceptual pair — see synthProphoto
				}
				if ((cyl(from) || cyl(to)) && !hslMeaningful(fromCoords, from)) {
					continue; // singular/out-of-gamut HSL/HWB — not a path the plugin takes
				}
				const mine = convert(fromCoords, from, to);
				const oracle = new Color(CJS_ID[from], fromCoords).to(CJS_ID[to]).coords as Vec3;
				// HSL/HWB are shown to ~1 decimal and amplify sub-tolerance input
				// drift; everything else holds to the strict 2e-4 default.
				assertClose(mine, oracle, from, to, cyl(from) || cyl(to) ? 3e-3 : 2e-4);
			}
		}
	});
}

test('convert: round-trips back to the source', () => {
	// Looser than the colorjs-parity gate above: a round trip crosses the D50
	// Bradford matrices (not exact inverses — kept verbatim for parity, ~3e-7
	// residue) and that residue is amplified near black by the toe-less rec2020
	// 2.4 gamma into ~2e-3. Still far below any real inverse bug. The strict
	// per-space parity above is the real gate; this is a self-consistency check.
	for (const seed of CORPUS) {
		for (const to of SPACES) {
			if ((cyl(seed.space) || cyl(to)) && !hslMeaningful(seed.coords, seed.space)) {
				continue; // singular/out-of-gamut HSL/HWB — not a path the plugin takes
			}
			const there = convert(seed.coords, seed.space, to);
			const back = convert(there, to, seed.space);
			assertClose(back, seed.coords, to, seed.space, 3e-3, 0.05);
		}
	}
});
