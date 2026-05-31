/*
 * CSS string serialisation, matching colorjs.io's output for the formats this
 * plugin emits: the perceptual/wide function notations (oklch/oklab/lch/lab/
 * hsl/hwb and color(display-p3|rec2020 …)) and hex. The model hand-builds the
 * legacy rgb()/rgba() forms itself; everything else routes through here.
 *
 * Conventions copied from colorjs: numbers round to N significant figures
 * (default 5) with trailing zeros stripped; the L of oklch/oklab/lch/lab and the
 * S/L · W/B of hsl/hwb render as percentages; alpha is appended as ` / a` only
 * when below 1.
 */
import type {Space, Vec3} from './convert.js';

export interface SerializeOptions {
	precision?: number;
	format?: 'hex';
}

/**
 * colorjs's toPrecision: round to (precision − integer-digit-count) decimal
 * places, with the integer-digit count clamped to ≥ 0 — so values below 1 keep
 * `precision` decimals rather than `precision` significant figures. Returned as
 * a number, so `String()` drops any trailing zeros.
 */
function round(n: number, precision: number): number {
	if (n === 0) {
		return 0;
	}
	const intDigits = Math.max(0, Math.floor(Math.log10(Math.abs(n))) + 1);
	const mult = 10 ** Math.max(0, precision - intDigits);
	return Math.round(n * mult) / mult;
}

const fmt = (n: number, p: number): string => String(round(n, p));

function hex(srgb: Vec3, alpha: number): string {
	const h = (c: number): string =>
		Math.round(Math.min(1, Math.max(0, c)) * 255)
			.toString(16)
			.padStart(2, '0');
	const base = `#${h(srgb[0])}${h(srgb[1])}${h(srgb[2])}`;
	return alpha < 1 ? base + h(alpha) : base;
}

/**
 * Serialise `coords` (in `space`, with `alpha`) to a CSS string. `format: 'hex'`
 * expects sRGB coords and emits `#rrggbb`/`#rrggbbaa`.
 */
export function serialize(
	coords: Vec3,
	space: Space,
	alpha = 1,
	opts: SerializeOptions = {},
): string {
	if (opts.format === 'hex') {
		return hex(coords, alpha);
	}
	const p = opts.precision ?? 5;
	const f = (n: number): string => fmt(n, p);
	const a = alpha < 1 ? ` / ${f(alpha)}` : '';
	const [x, y, z] = coords;
	switch (space) {
		case 'oklch':
			return `oklch(${f(x * 100)}% ${f(y)} ${f(z)}${a})`;
		case 'oklab':
			return `oklab(${f(x * 100)}% ${f(y)} ${f(z)}${a})`;
		case 'lch':
			return `lch(${f(x)}% ${f(y)} ${f(z)}${a})`;
		case 'lab':
			return `lab(${f(x)}% ${f(y)} ${f(z)}${a})`;
		case 'hsl':
			return `hsl(${f(x)} ${f(y)}% ${f(z)}%${a})`;
		case 'hwb':
			return `hwb(${f(x)} ${f(y)}% ${f(z)}%${a})`;
		case 'p3':
			return `color(display-p3 ${f(x)} ${f(y)} ${f(z)}${a})`;
		case 'rec2020':
			return `color(rec2020 ${f(x)} ${f(y)} ${f(z)}${a})`;
		case 'prophoto-rgb':
			return `color(prophoto-rgb ${f(x)} ${f(y)} ${f(z)}${a})`;
		case 'srgb':
			return `color(srgb ${f(x)} ${f(y)} ${f(z)}${a})`;
	}
}
