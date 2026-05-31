/*
 * OKLCH lightness×chroma plane compute — adapted from Adam Argyle's color-input
 * (MIT) https://github.com/argyleink/css-color-component
 * Copyright (c) 2024 Adam Argyle
 *
 * Pure and synchronous: given a fixed hue and a canvas size, produce the
 * gradient pixels plus the gamut-boundary polylines. Lightness is the y axis
 * (top = 1) and chroma the x axis, stretched per-lightness so the P3 gamut fills
 * the canvas width. The original ran this in a Web Worker across many colour
 * spaces; locked to OKLCH it runs on the main thread, so it bundles via Rollup.
 */
import {inGamut, to} from 'colorjs.io/fn';
// Side-effect: register the colorjs colour spaces these conversions need.
import './color.js';

/** Chroma the binary search never exceeds (past every real display gamut). */
const CHROMA_MAX = 0.5;
/** Gamut whose per-lightness max chroma is stretched to the canvas width. */
const STRETCH_GAMUT = 'p3';
/** Gradient is computed at 1/4 of the backing resolution, then scaled up. */
const PIXEL_DIVISOR = 4;

/** A gamut-boundary curve to stroke over the plane. */
export interface BoundarySpec {
	points: {x: number; y: number}[];
	color: string;
	lineWidth: number;
	dash: number[];
}

/** Boundary curves drawn over the plane, widest → narrowest. The stretch gamut
 *  (P3) is the canvas edge itself, so it is not in this list. */
const GAMUTS: {space: string; color: string; width: number; dash: number[]}[] = [
	{space: 'prophoto-rgb', color: 'rgba(255,255,255,0.3)', width: 0.75, dash: [2, 3]},
	{space: 'rec2020', color: 'rgba(255,255,255,0.4)', width: 1, dash: [3, 3]},
	{space: 'srgb', color: 'rgba(255,255,255,0.7)', width: 1.5, dash: []},
];

/** Linearly interpolate a LUT at normalised position `t` ∈ [0,1]. */
export function lerpLUT(lut: Float64Array, t: number): number {
	const n = lut.length - 1;
	const i = Math.max(0, Math.min(n, t * n));
	const lo = Math.floor(i);
	const hi = Math.min(lo + 1, n);
	const f = i - lo;
	return lut[lo]! * (1 - f) + lut[hi]! * f;
}

/** Is OKLCH (`L`, `C`, `hue`) inside `gamut`? */
function inOklchGamut(L: number, C: number, hue: number, gamut: string): boolean {
	const c = to({spaceId: 'oklch', coords: [L, C, hue], alpha: 1}, gamut);
	return inGamut({spaceId: gamut, coords: c.coords, alpha: null});
}

/** Max in-`gamut` chroma at each of `size` lightness samples (L 0→1), binary-searched. */
export function computeChromaLUT(
	hue: number,
	gamut: string,
	size: number,
): Float64Array {
	const lut = new Float64Array(size);
	for (let i = 0; i < size; i++) {
		const L = i / (size - 1);
		if (!inOklchGamut(L, 0, hue, gamut)) {
			lut[i] = 0;
			continue;
		}
		let lo = 0;
		let hi = CHROMA_MAX;
		for (let j = 0; j < 16; j++) {
			const mid = (lo + hi) / 2;
			if (inOklchGamut(L, mid, hue, gamut)) lo = mid;
			else hi = mid;
		}
		lut[i] = lo;
	}
	return lut;
}

/** Quarter-res gradient pixels: x = chroma fraction, y = lightness (top = 1). */
function computePixels(
	hue: number,
	W: number,
	H: number,
	target: string,
	chromaLUT: Float64Array,
): Uint8ClampedArray {
	const px = new Uint8ClampedArray(W * H * 4);
	for (let y = 0; y < H; y++) {
		const L = 1 - y / (H - 1);
		const maxC = lerpLUT(chromaLUT, L);
		for (let x = 0; x < W; x++) {
			const C = (x / (W - 1)) * maxC;
			const [r, g, b] = to({spaceId: 'oklch', coords: [L, C, hue], alpha: null}, target)
				.coords;
			const i = (y * W + x) * 4;
			px[i] = Math.round(Math.max(0, Math.min(1, r ?? 0)) * 255);
			px[i + 1] = Math.round(Math.max(0, Math.min(1, g ?? 0)) * 255);
			px[i + 2] = Math.round(Math.max(0, Math.min(1, b ?? 0)) * 255);
			px[i + 3] = 255;
		}
	}
	return px;
}

/** For each gamut, the L→chroma boundary as canvas points (chroma normalised to
 *  the stretched P3 width, so curves wider than P3 sit at the right edge). */
function computeBoundaries(
	hue: number,
	W: number,
	H: number,
	dpr: number,
	chromaLUT: Float64Array,
): BoundarySpec[] {
	const ROWS = 100;
	const out: BoundarySpec[] = [];
	for (const g of GAMUTS) {
		const points: {x: number; y: number}[] = [];
		try {
			for (let row = 0; row <= ROWS; row++) {
				const L = row / ROWS;
				if (!inOklchGamut(L, 0, hue, g.space)) continue;
				const maxOuter = lerpLUT(chromaLUT, L);
				if (maxOuter <= 0) continue;
				let lo = 0;
				let hi = maxOuter;
				for (let i = 0; i < 10; i++) {
					const mid = (lo + hi) / 2;
					if (inOklchGamut(L, mid, hue, g.space)) lo = mid;
					else hi = mid;
				}
				points.push({x: (lo / maxOuter) * W, y: (1 - L) * H});
			}
			out.push({
				points,
				color: g.color,
				lineWidth: g.width * dpr,
				dash: g.dash.map((d) => d * dpr),
			});
		} catch {
			/* skip a gamut colorjs can't convert to */
		}
	}
	return out;
}

export interface AreaRequest {
	hue: number;
	cssW: number;
	cssH: number;
	dpr: number;
	supportsP3: boolean;
}

export interface AreaResult {
	pixels: ArrayBuffer;
	W: number;
	H: number;
	backingW: number;
	backingH: number;
	chromaLUT: Float64Array;
	boundaries: BoundarySpec[];
}

/** Compute the plane: quarter-res gradient pixels + full-res boundary lines. */
export function computeArea(req: AreaRequest): AreaResult {
	const backingW = Math.round(req.cssW * req.dpr);
	const backingH = Math.round(req.cssH * req.dpr);
	const W = Math.round(backingW / PIXEL_DIVISOR);
	const H = Math.round(backingH / PIXEL_DIVISOR);
	const target = req.supportsP3 ? 'p3' : 'srgb';
	const chromaLUT = computeChromaLUT(req.hue, STRETCH_GAMUT, 128);
	const pixels = computePixels(req.hue, W, H, target, chromaLUT);
	const boundaries = computeBoundaries(req.hue, backingW, backingH, req.dpr, chromaLUT);
	return {pixels: pixels.buffer, W, H, backingW, backingH, chromaLUT, boundaries};
}
