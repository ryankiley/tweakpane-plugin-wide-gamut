/*
 * Stress tests for the colour-area raster (src/area-compute.ts): the gradient
 * pixels, the per-lightness chroma "stretch" curve, and the gamut-boundary
 * polylines — across the full hue wheel and a range of canvas sizes. colorjs.io
 * is the oracle for the gamut boundaries and the gradient colours.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import {computeArea, sampleCurve} from '../src/area-compute.js';
import type {AreaRequest, BoundarySpec} from '../src/area-compute.js';

const HUES = [0, 17, 60, 95, 140, 200, 250, 300, 330, 359];
const SIZES: [number, number][] = [
	[1, 1],
	[2, 3],
	[320, 200],
	[640, 100],
	[1024, 768],
];

/** True max in-gamut chroma at (L, hue) per colorjs, by fine bisection. */
function cjsMaxChroma(L: number, hue: number, gamut: string): number {
	if (!new Color('oklch', [L, 0, hue]).inGamut(gamut)) {
		return 0;
	}
	let lo = 0;
	let hi = 0.5;
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (new Color('oklch', [L, mid, hue]).inGamut(gamut)) lo = mid;
		else hi = mid;
	}
	return lo;
}

test('computeArea never produces NaN / out-of-range output, any hue or size', () => {
	for (const hue of HUES) {
		for (const [cssW, cssH] of SIZES) {
			for (const dpr of [1, 2, 3]) {
				for (const supportsP3 of [true, false]) {
					const req: AreaRequest = {
						hue,
						cssW,
						cssH,
						dpr,
						supportsP3,
						stretch: 'p3',
					};
					const res = computeArea(req);
					const px = new Uint8ClampedArray(res.pixels);
					assert.equal(px.length, res.W * res.H * 4, `pixel buffer size ${hue}/${cssW}x${cssH}`);
					// Uint8ClampedArray already bounds 0..255; assert alpha is opaque.
					for (let i = 3; i < px.length; i += 4) {
						assert.equal(px[i], 255, 'alpha byte');
					}
					assert.equal(res.chromaCurve.length, 128);
					for (const c of res.chromaCurve) {
						assert.ok(Number.isFinite(c) && c >= 0 && c <= 0.5, `curve value ${c}`);
					}
					for (const b of res.boundaries) {
						for (const p of b.points) {
							assert.ok(Number.isFinite(p.x) && p.x >= -0.01 && p.x <= res.backingW + 0.01, `bx ${p.x}`);
							assert.ok(Number.isFinite(p.y) && p.y >= -0.01 && p.y <= res.backingH + 0.01, `by ${p.y}`);
						}
					}
				}
			}
		}
	}
});

test('stretch curve matches the colorjs chroma boundary for each gamut', () => {
	for (const gamut of ['srgb', 'p3', 'rec2020'] as const) {
		for (const hue of HUES) {
			const res = computeArea({
				hue,
				cssW: 320,
				cssH: 200,
				dpr: 2,
				supportsP3: true,
				stretch: gamut,
			});
			// Compare at the curve's own 128 sample points (no interpolation error).
			for (let i = 0; i < res.chromaCurve.length; i++) {
				const L = i / (res.chromaCurve.length - 1);
				const mine = res.chromaCurve[i]!;
				const truth = cjsMaxChroma(L, hue, gamut);
				assert.ok(
					Math.abs(mine - truth) < 2e-3,
					`${gamut} hue ${hue} L ${L.toFixed(3)}: curve ${mine} vs colorjs ${truth}`,
				);
			}
		}
	}
});

test('gradient pixels match colorjs OKLCH→target conversion', () => {
	for (const hue of [30, 110, 215, 300]) {
		for (const supportsP3 of [true, false]) {
			const res = computeArea({hue, cssW: 256, cssH: 160, dpr: 1, supportsP3, stretch: 'p3'});
			const px = new Uint8ClampedArray(res.pixels);
			const target = supportsP3 ? 'p3' : 'srgb';
			// Sample a grid rather than every pixel.
			for (let gy = 0; gy < res.H; gy += Math.max(1, Math.floor(res.H / 16))) {
				for (let gx = 0; gx < res.W; gx += Math.max(1, Math.floor(res.W / 16))) {
					const L = 1 - gy / (res.H - 1);
					const chroma = (gx / (res.W - 1)) * sampleCurve(res.chromaCurve, L);
					const want = new Color('oklch', [L, chroma, hue]).to(target).coords;
					const o = (gy * res.W + gx) * 4;
					for (let k = 0; k < 3; k++) {
						const got = px[o + k]!;
						const exp = Math.round(Math.max(0, Math.min(1, want[k] ?? 0)) * 255);
						assert.ok(
							Math.abs(got - exp) <= 1,
							`hue ${hue} ${target} px(${gx},${gy}) ch${k}: ${got} vs ${exp}`,
						);
					}
				}
			}
		}
	}
});

test('boundary lines: sRGB inside + the plane gamut at the edge; sRGB plane is bare', () => {
	// sRGB stretch → no lines; P3 → sRGB inside + the P3 line riding the edge;
	// Rec2020 → [sRGB, P3] both inside (Rec2020 is the edge). Nesting: sRGB ⊆ P3 ⊆ edge.
	const base = {cssW: 320, cssH: 200, dpr: 2, supportsP3: true} as const;
	const at = (b: BoundarySpec, y: number): number | null => {
		const q = b.points.find((p) => Math.abs(p.y - y) < 1e-6);
		return q ? q.x : null;
	};
	for (const hue of HUES) {
		assert.equal(computeArea({...base, hue, stretch: 'srgb'}).boundaries.length, 0, `srgb hue ${hue}`);
		// P3 plane: sRGB line inside + the P3 line riding the right edge.
		const p3plane = computeArea({...base, hue, stretch: 'p3'});
		assert.equal(p3plane.boundaries.length, 2, `p3 hue ${hue}`);
		for (const p of p3plane.boundaries[1]!.points) {
			const L = 1 - p.y / p3plane.backingH;
			if (L < 0.05 || L > 0.95) {
				continue;
			}
			// Rides the edge (within 1% — sub-px interpolation wobble aside).
			assert.ok(p.x >= p3plane.backingW * 0.99, `hue ${hue} P3 rides the edge: ${p.x} vs ${p3plane.backingW}`);
		}
		const res = computeArea({...base, hue, stretch: 'rec2020'});
		assert.equal(res.boundaries.length, 2, `rec2020 hue ${hue}`);
		// boundaries are narrow → wide: [sRGB, P3].
		const [srgb, p3] = res.boundaries;
		// Skip the near-black/near-white tips (L ≲ 0.05, ≳ 0.95): the chroma range
		// collapses to ~0 there, so the normalised boundary is numerically degenerate.
		for (const p of srgb!.points) {
			const L = 1 - p.y / res.backingH;
			if (L < 0.05 || L > 0.95) {
				continue;
			}
			assert.ok(Number.isFinite(p.x) && p.x >= -0.01 && p.x <= res.backingW + 0.01, `srgb x ${p.x}`);
			const px = at(p3!, p.y);
			if (px != null) {
				assert.ok(p.x <= px + 0.5, `hue ${hue} srgb(${p.x}) ≤ p3(${px}) at y=${p.y}`);
				assert.ok(px <= res.backingW + 0.5, `hue ${hue} p3 within edge`);
			}
		}
	}
});

test('sampleCurve interpolates and clamps', () => {
	const c = Float64Array.from([0, 1, 4]); // 3 samples at t = 0, 0.5, 1
	assert.equal(sampleCurve(c, 0), 0);
	assert.equal(sampleCurve(c, 1), 4);
	assert.equal(sampleCurve(c, 0.5), 1);
	assert.equal(sampleCurve(c, 0.25), 0.5); // midpoint of [0,1]
	assert.equal(sampleCurve(c, 0.75), 2.5); // midpoint of [1,4]
	assert.equal(sampleCurve(c, -1), 0); // clamps below
	assert.equal(sampleCurve(c, 2), 4); // clamps above
});
