/*
 * Builds the OKLCH lightness×chroma plane for a fixed hue: the gradient image
 * plus the gamut-boundary polylines drawn over it.
 *
 * Everything derives from one primitive — `maxChroma(L, hue, gamut)`, the
 * largest in-gamut chroma at a given lightness, found by bisection against the
 * in-house colour engine (./core). The plane stretches to the caller's `stretch`
 * gamut: its max-chroma curve sets the gradient's right edge at every row, and
 * each gamut *narrower* than the stretch is plotted as a boundary line at its
 * fraction of that edge. Lightness is the vertical axis (top = 1).
 */
import type {Space} from './core/convert.js';
import {convert} from './core/convert.js';
import {inGamut} from './core/gamut.js';

/** Gradient is rasterised at 1/4 of the backing resolution, then scaled up. */
const SUBSAMPLE = 4;
/** Upper bound for the chroma bisection — beyond every physical display gamut. */
const CHROMA_CEILING = 0.5;
/** Bisection steps: 16 ⇒ ~0.5/2¹⁶ ≈ 8e-6 chroma resolution. */
const BISECT_STEPS = 16;
/** Samples in the per-lightness chroma curve handed back for thumb placement. */
const CURVE_SAMPLES = 128;

/** A gamut-boundary curve to stroke over the plane. */
export interface BoundarySpec {
	points: {x: number; y: number}[];
	color: string;
	lineWidth: number;
	dash: number[];
}

/** Gamut nesting by chroma extent, narrow → wide. The plane's stretch gamut is
 *  the canvas edge; only gamuts strictly narrower than it are drawn as lines. */
const GAMUT_RANK: Record<Space, number> = {
	srgb: 0,
	p3: 1,
	rec2020: 2,
	'prophoto-rgb': 3,
	// non-RGB spaces never act as a plane gamut; rank them past the widest.
	hsl: 9,
	hwb: 9,
	lab: 9,
	lch: 9,
	oklab: 9,
	oklch: 9,
};

/** Boundary lines available to stroke over the plane, narrow → wide. The
 *  brighter/solid sRGB line and the fainter dashed P3 line appear whenever the
 *  plane is stretched wider than them. (No mode stretches past Rec2020, so
 *  Rec2020 is only ever the edge, never an inner line.) */
const BOUNDARIES: {
	space: Space;
	color: string;
	width: number;
	dash: number[];
}[] = [
	{space: 'srgb', color: 'rgba(255,255,255,0.7)', width: 1.5, dash: []},
	{space: 'p3', color: 'rgba(255,255,255,0.4)', width: 1, dash: [3, 3]},
];

/**
 * Largest chroma that keeps OKLCH(`L`, ·, `hue`) inside `gamut`, by bisection.
 * Returns 0 when the gamut doesn't even contain the achromatic point at this
 * lightness (so the row contributes nothing).
 */
function maxChroma(
	L: number,
	hue: number,
	gamut: Space,
	ceiling = CHROMA_CEILING,
): number {
	if (!inGamut([L, 0, hue], 'oklch', gamut)) {
		return 0;
	}
	let inside = 0;
	let outside = ceiling;
	for (let i = 0; i < BISECT_STEPS; i++) {
		const mid = (inside + outside) / 2;
		if (inGamut([L, mid, hue], 'oklch', gamut)) {
			inside = mid;
		} else {
			outside = mid;
		}
	}
	return inside;
}

/** Sample an evenly-spaced [0,1]-indexed curve at `t`, linearly interpolated. */
export function sampleCurve(curve: Float64Array, t: number): number {
	const last = curve.length - 1;
	const pos = Math.max(0, Math.min(last, t * last));
	const i = Math.floor(pos);
	const frac = pos - i;
	return curve[i]! * (1 - frac) + curve[Math.min(i + 1, last)]! * frac;
}

export interface AreaRequest {
	hue: number;
	cssW: number;
	cssH: number;
	dpr: number;
	supportsP3: boolean;
	/** Gamut stretched to fill the canvas width — the current mode's own gamut
	 *  ('srgb' for the sRGB-bound modes, 'p3', or 'rec2020' for Rec2020 and the
	 *  perceptual modes). Every narrower gamut is drawn as an inner boundary line. */
	stretch: Space;
}

export interface AreaResult {
	pixels: ArrayBuffer;
	W: number;
	H: number;
	backingW: number;
	backingH: number;
	/** Per-lightness max-chroma curve for the stretch gamut, for thumb placement. */
	chromaCurve: Float64Array;
	boundaries: BoundarySpec[];
}

const toByte = (v: number | null): number =>
	Math.round(Math.max(0, Math.min(1, v ?? 0)) * 255);

/** Trace one gamut's boundary as canvas points, x normalised to the stretch edge. */
function traceBoundary(
	spec: (typeof BOUNDARIES)[number],
	hue: number,
	stretch: Float64Array,
	W: number,
	H: number,
	dpr: number,
): BoundarySpec {
	const STEPS = 100;
	const points: {x: number; y: number}[] = [];
	for (let s = 0; s <= STEPS; s++) {
		const L = s / STEPS;
		const edge = sampleCurve(stretch, L);
		if (edge <= 0) {
			continue; // empty row — no chroma range to plot against
		}
		// Search within the stretch edge: a narrower gamut (sRGB inside P3, or sRGB
		// and P3 inside Rec2020) lands inside it. Tying the search to `edge` keeps
		// the ratio ordered and bounded even at the near-black/near-white extremes,
		// where `edge` itself is tiny and an independent search is noisy.
		const c = maxChroma(L, hue, spec.space, edge);
		if (c <= 0) {
			continue; // gamut empty at this lightness
		}
		points.push({x: (c / edge) * W, y: (1 - L) * H});
	}
	return {
		points,
		color: spec.color,
		lineWidth: spec.width * dpr,
		dash: spec.dash.map((d) => d * dpr),
	};
}

/** Compute the plane: subsampled gradient pixels + full-res boundary lines. */
export function computeArea(req: AreaRequest): AreaResult {
	const backingW = Math.round(req.cssW * req.dpr);
	const backingH = Math.round(req.cssH * req.dpr);
	const W = Math.round(backingW / SUBSAMPLE);
	const H = Math.round(backingH / SUBSAMPLE);
	const target: Space = req.supportsP3 ? 'p3' : 'srgb';

	// Stretch reference: the chroma ceiling of `req.stretch` at each lightness.
	// Drives both the gradient's per-row width and the boundary x-normalisation —
	// so in an sRGB stretch the whole plane is exactly the sRGB gamut.
	const stretch = new Float64Array(CURVE_SAMPLES);
	for (let i = 0; i < CURVE_SAMPLES; i++) {
		stretch[i] = maxChroma(i / (CURVE_SAMPLES - 1), req.hue, req.stretch);
	}

	// Rasterise the gradient: column x maps to chroma (x/W of the row's stretch
	// max), row y maps to lightness (top = 1).
	const pixels = new Uint8ClampedArray(W * H * 4);
	for (let y = 0; y < H; y++) {
		const L = 1 - y / (H - 1);
		const rowMax = sampleCurve(stretch, L);
		for (let x = 0; x < W; x++) {
			const chroma = (x / (W - 1)) * rowMax;
			const [r, g, b] = convert([L, chroma, req.hue], 'oklch', target);
			const o = (y * W + x) * 4;
			pixels[o] = toByte(r);
			pixels[o + 1] = toByte(g);
			pixels[o + 2] = toByte(b);
			pixels[o + 3] = 255;
		}
	}

	// Draw a line for each gamut strictly narrower than the stretch: sRGB only on
	// a P3 plane; sRGB + P3 on a Rec2020 plane; nothing on an sRGB plane.
	const boundaries = BOUNDARIES.filter(
		(spec) => GAMUT_RANK[spec.space] < GAMUT_RANK[req.stretch],
	).map((spec) =>
		traceBoundary(spec, req.hue, stretch, backingW, backingH, req.dpr),
	);

	return {
		pixels: pixels.buffer,
		W,
		H,
		backingW,
		backingH,
		chromaCurve: stretch,
		boundaries,
	};
}
