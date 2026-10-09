/*
 * Gamut testing and mapping.
 *
 * `inGamut` answers whether a colour fits a destination RGB gamut; `toGamut`
 * implements the CSS Color 4 gamut-mapping algorithm — reduce OKLCH chroma,
 * binary-searching, with local clipping bounded by the OKLab ΔE just-noticeable
 * difference. This matches colorjs.io's `to(dest, {inGamut: true})` (the plugin
 * uses it for the sRGB swatch / hex fallback), verified by the parity tests.
 */
import type {Space, Vec3} from './convert.js';
import {convert, oklchGamutProbe} from './convert.js';

// colorjs's default inGamut epsilon — small slack so a colour exactly on the
// boundary counts as inside.
const EPSILON = 0.000075;

/** Upper bound for the chroma bisection — beyond every physical display gamut. */
const CHROMA_CEILING = 0.5;
/** Bisection steps: 16 ⇒ ~0.5/2¹⁶ ≈ 8e-6 chroma resolution. */
const BISECT_STEPS = 16;

/**
 * Largest in-gamut chroma at lightness `L`, by bisecting a prebuilt per-hue
 * `probe` (see `oklchGamutProbe`). Returns 0 when the gamut doesn't even contain
 * the achromatic point at this lightness (so the row contributes nothing). Takes
 * the probe rather than a hue so a caller walking many lightnesses at one hue
 * builds it once.
 */
export function maxChromaOf(
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

/** Largest OKLCH chroma inside `gamut` at lightness `L` and hue `hue` (degrees):
 *  the right edge of the picker plane at that row. */
export function maxChroma(L: number, hue: number, gamut: Space): number {
	return maxChromaOf(oklchGamutProbe(hue, gamut), L);
}

/** Is `coords` (expressed in `space`) inside the `gamut` RGB space? */
export function inGamut(coords: Vec3, space: Space, gamut: Space): boolean {
	const rgb = space === gamut ? coords : convert(coords, space, gamut);
	return rgb.every((c) => c >= -EPSILON && c <= 1 + EPSILON);
}

function clip(rgb: Vec3): Vec3 {
	return [
		Math.min(1, Math.max(0, rgb[0])),
		Math.min(1, Math.max(0, rgb[1])),
		Math.min(1, Math.max(0, rgb[2])),
	];
}

/** OKLab ΔE: Euclidean distance in OKLab. */
function deltaEOK(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Map an OKLCH colour into `dest` (an RGB gamut) per CSS Color 4: if it already
 * fits, just convert; otherwise binary-search OKLCH chroma down, clipping
 * locally and stopping when the clipped result is within an OKLab JND.
 */
export function toGamut(oklch: Vec3, dest: Space): Vec3 {
	if (inGamut(oklch, 'oklch', dest)) {
		return convert(oklch, 'oklch', dest);
	}
	const L = oklch[0];
	if (L >= 1) {
		return [1, 1, 1];
	}
	if (L <= 0) {
		return [0, 0, 0];
	}

	const JND = 0.02;
	const EPS = 0.0001;
	const current: Vec3 = [oklch[0], oklch[1], oklch[2]];
	let min = 0;
	let max = oklch[1];
	let minInGamut = true;
	let clipped = clip(convert(current, 'oklch', dest));
	// CSS Color 4 step before the search: if clipping the origin is already within
	// a JND, return that clip rather than reducing chroma at all. This matters
	// where the gamut boundary isn't monotonic in chroma (e.g. ProPhoto near
	// black, where its red channel dips negative then recovers): the bisection's
	// midpoints can sit further out of gamut than the origin, which would
	// otherwise walk the result down to a needlessly low chroma.
	if (
		deltaEOK(
			convert(clipped, dest, 'oklab'),
			convert(oklch, 'oklch', 'oklab'),
		) < JND
	) {
		return clipped;
	}

	while (max - min > EPS) {
		const chroma = (min + max) / 2;
		current[1] = chroma;
		const inDest = convert(current, 'oklch', dest);
		if (minInGamut && inDest.every((c) => c >= -EPSILON && c <= 1 + EPSILON)) {
			min = chroma;
			continue;
		}
		clipped = clip(inDest);
		const e = deltaEOK(
			convert(clipped, dest, 'oklab'),
			convert(current, 'oklch', 'oklab'),
		);
		if (e < JND) {
			if (JND - e < EPS) {
				return clipped;
			}
			minInGamut = false;
			min = chroma;
		} else {
			max = chroma;
		}
	}
	return clipped;
}
