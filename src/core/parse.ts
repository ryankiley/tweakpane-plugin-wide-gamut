/*
 * CSS Color 4 string parser — the subset this plugin accepts as input: hex,
 * rgb()/rgba(), hsl()/hsla(), hwb(), lab(), lch(), oklab(), oklch(), the
 * color(<rgb-space> …) function, and the CSS named colours. Both legacy comma
 * syntax and modern space/slash syntax, with %, `none`, and angle units.
 *
 * Returns coords in the same conventions as convert.ts (so the result feeds
 * straight into `convert(... , 'oklch')`), or null if the string isn't a colour
 * we recognise. Powerless `none` becomes 0 (the model coalesces it anyway).
 *
 * Intentionally stricter than colorjs on two points (neither is a form the
 * plugin emits): alpha must use the spec's `/` separator (or the 4th slot of a
 * comma `rgba()`) — a bare 4th value like `oklch(L C H A)` is invalid CSS — and
 * `color()` is limited to the RGB spaces the plugin uses (srgb, display-p3,
 * rec2020, prophoto-rgb), not the full colorjs set (xyz, a98-rgb, …).
 */
import type {Space, Vec3} from './convert.js';

export interface ParsedColor {
	space: Space;
	coords: Vec3;
	alpha: number;
}

/** color() identifiers we support → our Space ids. */
const COLOR_FN_SPACES: Record<string, Space> = {
	srgb: 'srgb',
	'display-p3': 'p3',
	rec2020: 'rec2020',
	'prophoto-rgb': 'prophoto-rgb',
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// A bare number: optional sign, digits/decimal, optional exponent.
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const NUMBER_RE = new RegExp(`^${NUMBER}$`);
// A hue/angle is a number with an optional angle unit — never a percentage.
const ANGLE_RE = new RegExp(`^(${NUMBER})(deg|grad|rad|turn)?$`);

/** Parse a hue/angle token to degrees, or NaN if it isn't a valid angle (so the
 *  caller rejects it). Percentages are not valid angles. */
function parseAngle(tok: string): number {
	const m = ANGLE_RE.exec(tok);
	if (!m) return NaN;
	const n = parseFloat(m[1]);
	switch (m[2]) {
		case 'turn':
			return n * 360;
		case 'grad':
			return n * 0.9;
		case 'rad':
			return (n * 180) / Math.PI;
		default:
			return n; // deg or unitless
	}
}

type Kind =
	| 'rgb'
	| 'alpha'
	| 'pct'
	| 'okL'
	| 'unit'
	| 'labAB'
	| 'lchC'
	| 'okAB'
	| 'angle';

/** Parse one channel token under the given interpretation. `none` → 0; a token
 *  that isn't a well-formed number (empty, non-numeric, a stray `/` from mixed
 *  alpha syntax) → NaN, which the caller turns into a null parse. */
function chan(tok: string, kind: Kind): number {
	tok = tok.trim();
	if (tok === 'none') return 0;
	if (kind === 'angle') return parseAngle(tok);
	const pct = tok.endsWith('%');
	const numStr = pct ? tok.slice(0, -1) : tok;
	if (!NUMBER_RE.test(numStr)) return NaN;
	const n = parseFloat(numStr);
	switch (kind) {
		case 'rgb':
			return pct ? n / 100 : n / 255; // → 0..1
		case 'alpha':
			return clamp01(pct ? n / 100 : n); // → 0..1, clamped
		case 'pct':
			return n; // hsl S/L, hwb W/B, lab/lch L: value is already 0..100
		case 'okL':
			return pct ? n / 100 : n; // oklch/oklab L → 0..1
		case 'unit':
			return pct ? n / 100 : n; // color() channel → 0..1
		case 'labAB':
			return pct ? n * 1.25 : n; // 100% ↔ 125
		case 'lchC':
			return pct ? n * 1.5 : n; // 100% ↔ 150
		case 'okAB':
			return pct ? n * 0.004 : n; // 100% ↔ 0.4
	}
}

/** Split a function's inner text into channel tokens + an optional alpha token,
 *  handling both legacy comma syntax and modern space / slash syntax. Returns
 *  null for shapes that aren't valid CSS: a comma count other than 3 or 4, or
 *  more than one `/` alpha separator. */
function splitArgs(
	inner: string,
): {channels: string[]; alpha: string | null} | null {
	const t = inner.trim();
	if (t.includes(',')) {
		const parts = t.split(',').map((s) => s.trim());
		if (parts.length === 4)
			return {channels: parts.slice(0, 3), alpha: parts[3]};
		if (parts.length === 3) return {channels: parts, alpha: null};
		return null;
	}
	const slash = t.split('/');
	if (slash.length > 2) return null;
	return {
		channels: slash[0].trim().split(/\s+/),
		alpha: slash.length === 2 ? slash[1].trim() : null,
	};
}

function hexToSrgb(hex: string): ParsedColor | null {
	let h = hex.slice(1);
	if (h.length === 3 || h.length === 4) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	if (h.length !== 6 && h.length !== 8) {
		return null;
	}
	const v = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
	return {
		space: 'srgb',
		coords: [v(0), v(2), v(4)],
		alpha: h.length === 8 ? v(6) : 1,
	};
}

/** Three channel kinds + the space, per function name. */
const FUNCS: Record<string, {space: Space; kinds: [Kind, Kind, Kind]}> = {
	rgb: {space: 'srgb', kinds: ['rgb', 'rgb', 'rgb']},
	rgba: {space: 'srgb', kinds: ['rgb', 'rgb', 'rgb']},
	hsl: {space: 'hsl', kinds: ['angle', 'pct', 'pct']},
	hsla: {space: 'hsl', kinds: ['angle', 'pct', 'pct']},
	hwb: {space: 'hwb', kinds: ['angle', 'pct', 'pct']},
	lab: {space: 'lab', kinds: ['pct', 'labAB', 'labAB']},
	lch: {space: 'lch', kinds: ['pct', 'lchC', 'angle']},
	oklab: {space: 'oklab', kinds: ['okL', 'okAB', 'okAB']},
	oklch: {space: 'oklch', kinds: ['okL', 'okAB', 'angle']},
};

/** Assemble a result, rejecting (→ null) when any coord or the alpha is NaN —
 *  the signal that a channel token was ill-formed. */
function result(space: Space, coords: Vec3, alpha: number): ParsedColor | null {
	return Number.isNaN(coords[0]) ||
		Number.isNaN(coords[1]) ||
		Number.isNaN(coords[2]) ||
		Number.isNaN(alpha)
		? null
		: {space, coords, alpha};
}

export function parse(css: string): ParsedColor | null {
	const s = css.trim().toLowerCase();
	if (s === 'transparent') {
		return {space: 'srgb', coords: [0, 0, 0], alpha: 0};
	}
	if (s[0] === '#') {
		return /^#[0-9a-f]+$/.test(s) ? hexToSrgb(s) : null;
	}

	const fn = /^([a-z0-9-]+)\(([^)]*)\)$/.exec(s);
	if (fn) {
		const name = fn[1];
		const args = splitArgs(fn[2]);
		if (!args) {
			return null;
		}
		const {channels, alpha} = args;
		const a = alpha != null ? chan(alpha, 'alpha') : 1;

		if (name === 'color') {
			const space = COLOR_FN_SPACES[channels[0]];
			if (!space || channels.length !== 4) {
				return null;
			}
			return result(
				space,
				[
					chan(channels[1], 'unit'),
					chan(channels[2], 'unit'),
					chan(channels[3], 'unit'),
				],
				a,
			);
		}

		const spec = FUNCS[name];
		if (!spec || channels.length !== 3) {
			return null;
		}
		return result(
			spec.space,
			[
				chan(channels[0], spec.kinds[0]),
				chan(channels[1], spec.kinds[1]),
				chan(channels[2], spec.kinds[2]),
			],
			a,
		);
	}

	const named = NAMED_COLORS[s];
	return named ? hexToSrgb(named) : null;
}

/** CSS named colours → hex (the extended set, plus `rebeccapurple`). */
const NAMED_COLORS: Record<string, string> = {
	aliceblue: '#f0f8ff',
	antiquewhite: '#faebd7',
	aqua: '#00ffff',
	aquamarine: '#7fffd4',
	azure: '#f0ffff',
	beige: '#f5f5dc',
	bisque: '#ffe4c4',
	black: '#000000',
	blanchedalmond: '#ffebcd',
	blue: '#0000ff',
	blueviolet: '#8a2be2',
	brown: '#a52a2a',
	burlywood: '#deb887',
	cadetblue: '#5f9ea0',
	chartreuse: '#7fff00',
	chocolate: '#d2691e',
	coral: '#ff7f50',
	cornflowerblue: '#6495ed',
	cornsilk: '#fff8dc',
	crimson: '#dc143c',
	cyan: '#00ffff',
	darkblue: '#00008b',
	darkcyan: '#008b8b',
	darkgoldenrod: '#b8860b',
	darkgray: '#a9a9a9',
	darkgreen: '#006400',
	darkgrey: '#a9a9a9',
	darkkhaki: '#bdb76b',
	darkmagenta: '#8b008b',
	darkolivegreen: '#556b2f',
	darkorange: '#ff8c00',
	darkorchid: '#9932cc',
	darkred: '#8b0000',
	darksalmon: '#e9967a',
	darkseagreen: '#8fbc8f',
	darkslateblue: '#483d8b',
	darkslategray: '#2f4f4f',
	darkslategrey: '#2f4f4f',
	darkturquoise: '#00ced1',
	darkviolet: '#9400d3',
	deeppink: '#ff1493',
	deepskyblue: '#00bfff',
	dimgray: '#696969',
	dimgrey: '#696969',
	dodgerblue: '#1e90ff',
	firebrick: '#b22222',
	floralwhite: '#fffaf0',
	forestgreen: '#228b22',
	fuchsia: '#ff00ff',
	gainsboro: '#dcdcdc',
	ghostwhite: '#f8f8ff',
	gold: '#ffd700',
	goldenrod: '#daa520',
	gray: '#808080',
	green: '#008000',
	greenyellow: '#adff2f',
	grey: '#808080',
	honeydew: '#f0fff0',
	hotpink: '#ff69b4',
	indianred: '#cd5c5c',
	indigo: '#4b0082',
	ivory: '#fffff0',
	khaki: '#f0e68c',
	lavender: '#e6e6fa',
	lavenderblush: '#fff0f5',
	lawngreen: '#7cfc00',
	lemonchiffon: '#fffacd',
	lightblue: '#add8e6',
	lightcoral: '#f08080',
	lightcyan: '#e0ffff',
	lightgoldenrodyellow: '#fafad2',
	lightgray: '#d3d3d3',
	lightgreen: '#90ee90',
	lightgrey: '#d3d3d3',
	lightpink: '#ffb6c1',
	lightsalmon: '#ffa07a',
	lightseagreen: '#20b2aa',
	lightskyblue: '#87cefa',
	lightslategray: '#778899',
	lightslategrey: '#778899',
	lightsteelblue: '#b0c4de',
	lightyellow: '#ffffe0',
	lime: '#00ff00',
	limegreen: '#32cd32',
	linen: '#faf0e6',
	magenta: '#ff00ff',
	maroon: '#800000',
	mediumaquamarine: '#66cdaa',
	mediumblue: '#0000cd',
	mediumorchid: '#ba55d3',
	mediumpurple: '#9370db',
	mediumseagreen: '#3cb371',
	mediumslateblue: '#7b68ee',
	mediumspringgreen: '#00fa9a',
	mediumturquoise: '#48d1cc',
	mediumvioletred: '#c71585',
	midnightblue: '#191970',
	mintcream: '#f5fffa',
	mistyrose: '#ffe4e1',
	moccasin: '#ffe4b5',
	navajowhite: '#ffdead',
	navy: '#000080',
	oldlace: '#fdf5e6',
	olive: '#808000',
	olivedrab: '#6b8e23',
	orange: '#ffa500',
	orangered: '#ff4500',
	orchid: '#da70d6',
	palegoldenrod: '#eee8aa',
	palegreen: '#98fb98',
	paleturquoise: '#afeeee',
	palevioletred: '#db7093',
	papayawhip: '#ffefd5',
	peachpuff: '#ffdab9',
	peru: '#cd853f',
	pink: '#ffc0cb',
	plum: '#dda0dd',
	powderblue: '#b0e0e6',
	purple: '#800080',
	rebeccapurple: '#663399',
	red: '#ff0000',
	rosybrown: '#bc8f8f',
	royalblue: '#4169e1',
	saddlebrown: '#8b4513',
	salmon: '#fa8072',
	sandybrown: '#f4a460',
	seagreen: '#2e8b57',
	seashell: '#fff5ee',
	sienna: '#a0522d',
	silver: '#c0c0c0',
	skyblue: '#87ceeb',
	slateblue: '#6a5acd',
	slategray: '#708090',
	slategrey: '#708090',
	snow: '#fffafa',
	springgreen: '#00ff7f',
	steelblue: '#4682b4',
	tan: '#d2b48c',
	teal: '#008080',
	thistle: '#d8bfd8',
	tomato: '#ff6347',
	turquoise: '#40e0d0',
	violet: '#ee82ee',
	wheat: '#f5deb3',
	white: '#ffffff',
	whitesmoke: '#f5f5f5',
	yellow: '#ffff00',
	yellowgreen: '#9acd32',
};
