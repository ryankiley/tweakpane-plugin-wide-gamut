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
import {convert} from './convert.js';

// colorjs's default inGamut epsilon — small slack so a colour exactly on the
// boundary counts as inside.
const EPSILON = 0.000075;

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
