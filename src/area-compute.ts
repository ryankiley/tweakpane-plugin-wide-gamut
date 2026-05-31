/*
 * Builds the OKLCH lightness×chroma plane for a fixed hue: the gradient image
 * plus the gamut-boundary polylines drawn over it.
 *
 * Everything derives from one primitive — the largest in-gamut chroma at a
 * given lightness, found by bisecting a per-hue gamut probe from the in-house
 * colour engine (./core). The plane stretches to the caller's `stretch` gamut:
 * its max-chroma curve sets the gradient's right edge at every row, and each
 * gamut *narrower* than the stretch is plotted as a boundary line at its
 * fraction of that edge. Lightness is the vertical axis (top = 1).
 */
import type {Space} from './core/convert.js';
import {convert, oklchGamutProbe} from './core/convert.js';

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

/** Boundary lines available to stroke over the plane, narrow → wide. Each is
 *  drawn when the plane is stretched to it or wider. The plugin caps the stretch
 *  at P3 (`areaStretch`), so a wide plane shows the solid sRGB line inside and the
 *  dashed P3 line riding the edge (the displayable limit). */
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
 * Largest in-gamut chroma at lightness `L`, by bisecting a prebuilt per-hue
 * `probe` (see `oklchGamutProbe`). Returns 0 when the gamut doesn't even contain
 * the achromatic point at this lightness (so the row contributes nothing). The
 * probe is built once per hue/gamut and reused across every lightness — that
 * reuse is the bulk of the per-frame saving.
 */
function maxChroma(
	probe: (L: number, C: number) => boolean,
	L: number,
	ceiling = CHROMA_CEILING,
): number {
	if (!probe(L, 0)) {
		return 0;
	}
	let inside = 0;
	let outside = ceiling;
	for (let i = 0; i < BISECT_STEPS; i++) {
		const mid = (inside + outside) / 2;
		if (probe(L, mid)) {
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
	/** Gamut stretched to fill the canvas width. The plugin passes 'srgb' (the
	 *  sRGB-bound modes) or 'p3' (every wide mode); the primitive also accepts
	 *  wider. Every narrower gamut is drawn as an inner boundary line. */
	stretch: Space;
}

export interface AreaResult {
	pixels: Uint8ClampedArray;
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
	const probe = oklchGamutProbe(hue, spec.space);
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
		const c = maxChroma(probe, L, edge);
		if (c <= 0) {
			continue; // gamut empty at this lightness
		}
		// A line riding the very edge (the stretch gamut's own boundary, e.g. P3 on
		// a P3 plane) would be half-clipped by the canvas border; pull it in by half
		// its stroke so it hugs the edge fully visible.
		const x = Math.min((c / edge) * W, W - (spec.width * dpr) / 2);
		points.push({x, y: (1 - L) * H});
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
	const stretchProbe = oklchGamutProbe(req.hue, req.stretch);
	const stretch = new Float64Array(CURVE_SAMPLES);
	for (let i = 0; i < CURVE_SAMPLES; i++) {
		stretch[i] = maxChroma(stretchProbe, i / (CURVE_SAMPLES - 1));
	}

	// Rasterise the gradient: column x maps to chroma (x/W of the row's stretch
	// max), row y maps to lightness (top = 1).
	const pixels = new Uint8ClampedArray(W * H * 4);
	const invH = H > 1 ? 1 / (H - 1) : 0;
	const invW = W > 1 ? 1 / (W - 1) : 0;
	for (let y = 0; y < H; y++) {
		const L = 1 - y * invH;
		const rowMax = sampleCurve(stretch, L);
		for (let x = 0; x < W; x++) {
			const chroma = x * invW * rowMax;
			const [r, g, b] = convert([L, chroma, req.hue], 'oklch', target);
			const o = (y * W + x) * 4;
			pixels[o] = toByte(r);
			pixels[o + 1] = toByte(g);
			pixels[o + 2] = toByte(b);
			pixels[o + 3] = 255;
		}
	}

	// Draw a line for every gamut up to and including the stretch: narrower gamuts
	// fall inside (the solid sRGB line) and the stretch gamut itself rides the edge
	// (the dashed P3 line on a P3 plane), marking the displayable limit. An sRGB
	// plane stays bare — the whole area is in gamut, so there's nothing to mark.
	const boundaries =
		req.stretch === 'srgb'
			? []
			: BOUNDARIES.filter(
					(spec) => GAMUT_RANK[spec.space] <= GAMUT_RANK[req.stretch],
			  ).map((spec) =>
					traceBoundary(spec, req.hue, stretch, backingW, backingH, req.dpr),
			  );

	return {
		pixels,
		W,
		H,
		backingW,
		backingH,
		chromaCurve: stretch,
		boundaries,
	};
}
