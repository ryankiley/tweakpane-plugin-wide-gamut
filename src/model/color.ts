/*
 * Internal colour model for the OKLCH plugin — a thin immutable wrapper over
 * colorjs.io/fn.
 *
 * Canonical representation is OKLCH: it is the picker's working space and is
 * lossless across sRGB / Display-P3 / Rec2020, so dragging into the wide-gamut
 * region of the area picker never clips mid-edit. The binding's *source format*
 * (hex / rgb() / oklch() / color(display-p3 …) …) is remembered so values
 * round-trip in whatever shape the user supplied, and the verbatim source string
 * is returned unchanged until the colour is actually edited.
 */
// Side-effect import: registers all colorjs colour spaces (sRGB, OKLCH, P3, …).
import '../vendor/color.js';

import {
	type ColorConstructor,
	getColor,
	inGamut as cjsInGamut,
	parse,
	serialize,
	to,
} from 'colorjs.io/fn';

/** Editing modes offered by the mode dropdown. Each value is a colorjs space id
 *  (so the mode↔space mapping is identity), except `hex` (sRGB as `#…`) and `css`
 *  (sRGB as legacy `rgba(r, g, b, a)`). */
export type EditMode =
	| 'oklch'
	| 'oklab'
	| 'lch'
	| 'lab'
	| 'srgb'
	| 'css'
	| 'hsl'
	| 'hwb'
	| 'hex'
	| 'p3'
	| 'rec2020';

/** Gamuts the picker can test against. */
export type Gamut = 'srgb' | 'p3';

// Dropdown order: everyday sRGB/CSS formats first, then perceptual, then
// wide-gamut — familiar-first, matching Figma / DevTools conventions.
export const EDIT_MODES: EditMode[] = [
	'hex',
	'srgb',
	'css',
	'hsl',
	'hwb',
	'oklch',
	'oklab',
	'lch',
	'lab',
	'p3',
	'rec2020',
];

/** Modes whose space only covers sRGB: switching into one snaps a wider-gamut
 *  colour into sRGB so its channels stay meaningful. The perceptual (OKLCH /
 *  OKLab / LCH / Lab) and wide-RGB (P3 / Rec2020) modes keep the full colour. */
const SRGB_BOUND_MODES: EditMode[] = ['srgb', 'css', 'hsl', 'hwb', 'hex'];

/** Whether the area draws the sRGB gamut boundary in this mode: shown for every
 *  mode whose space can exceed sRGB, hidden for the sRGB-bound ones (where the
 *  whole plane is reachable, so the line carries no information). */
export function showsGamutBoundary(mode: EditMode): boolean {
	return !SRGB_BOUND_MODES.includes(mode);
}

/** Hard cap on OKLCH chroma. Beyond any real display gamut (ProPhoto tops out
 *  near 0.49), so it rejects nonsense input (e.g. a typed chroma of 40000)
 *  without ever clipping a colour that could actually be shown. */
const MAX_CHROMA = 0.5;

export const MODE_LABELS: Record<EditMode, string> = {
	oklch: 'OKLCH',
	oklab: 'OKLab',
	lch: 'LCH',
	lab: 'Lab',
	srgb: 'RGB',
	css: 'CSS',
	hsl: 'HSL',
	hwb: 'HWB',
	hex: 'HEX',
	p3: 'P3',
	rec2020: 'Rec2020',
};

/** colorjs.io space id backing an edit mode (hex + css share the sRGB space). */
export function modeSpaceId(mode: EditMode): string {
	return mode === 'hex' || mode === 'css' ? 'srgb' : mode;
}

/** A single numeric channel input for a mode. `display = coord * scale`. */
export interface ChannelDescriptor {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	/** Multiplier from the canonical colorjs coord to the displayed value. */
	scale: number;
}

/**
 * Per-mode channel descriptors, in display units that match CSS Color 4 /
 * oklch.com / DevTools conventions (`display = coord * scale`):
 * - OKLCH: L 0–100, C 0–0.5, H 0–360       · OKLab: L 0–100, a/b ±0.4
 * - LCH:   L 0–100, C 0–150, H 0–360        · Lab:   L 0–100, a/b ±125
 * - RGB:   R/G/B 0–255 (integers)           · HSL:   H 0–360, S/L 0–100
 * - HWB:   H 0–360, W/B 0–100               · P3 / Rec2020: R/G/B 0–1
 * (HEX has no numeric channels — it uses a single text field.)
 */
export const MODE_CHANNELS: Record<
	Exclude<EditMode, 'hex'>,
	ChannelDescriptor[]
> = {
	oklch: [
		{key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 100},
		{key: 'c', label: 'C', min: 0, max: MAX_CHROMA, step: 0.01, scale: 1},
		{key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1},
	],
	oklab: [
		{key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 100},
		{key: 'a', label: 'a', min: -0.4, max: 0.4, step: 0.01, scale: 1},
		{key: 'b', label: 'b', min: -0.4, max: 0.4, step: 0.01, scale: 1},
	],
	lch: [
		{key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1},
		{key: 'c', label: 'C', min: 0, max: 150, step: 1, scale: 1},
		{key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1},
	],
	lab: [
		{key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1},
		{key: 'a', label: 'a', min: -125, max: 125, step: 1, scale: 1},
		{key: 'b', label: 'b', min: -125, max: 125, step: 1, scale: 1},
	],
	srgb: [
		{key: 'r', label: 'R', min: 0, max: 255, step: 1, scale: 255},
		{key: 'g', label: 'G', min: 0, max: 255, step: 1, scale: 255},
		{key: 'b', label: 'B', min: 0, max: 255, step: 1, scale: 255},
	],
	// CSS mode = sRGB channels, output as legacy `rgba(r, g, b, a)`.
	css: [
		{key: 'r', label: 'R', min: 0, max: 255, step: 1, scale: 255},
		{key: 'g', label: 'G', min: 0, max: 255, step: 1, scale: 255},
		{key: 'b', label: 'B', min: 0, max: 255, step: 1, scale: 255},
	],
	hsl: [
		{key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1},
		{key: 's', label: 'S', min: 0, max: 100, step: 1, scale: 1},
		{key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1},
	],
	hwb: [
		{key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1},
		{key: 'w', label: 'W', min: 0, max: 100, step: 1, scale: 1},
		{key: 'b', label: 'B', min: 0, max: 100, step: 1, scale: 1},
	],
	p3: [
		{key: 'r', label: 'R', min: 0, max: 1, step: 0.01, scale: 1},
		{key: 'g', label: 'G', min: 0, max: 1, step: 0.01, scale: 1},
		{key: 'b', label: 'B', min: 0, max: 1, step: 0.01, scale: 1},
	],
	rec2020: [
		{key: 'r', label: 'R', min: 0, max: 1, step: 0.01, scale: 1},
		{key: 'g', label: 'G', min: 0, max: 1, step: 0.01, scale: 1},
		{key: 'b', label: 'B', min: 0, max: 1, step: 0.01, scale: 1},
	],
};

/** Decimal places a channel is displayed at, from its step — shared by the open
 *  numeric inputs and the collapsed readout so they round identically. */
export function digitsFor(step: number): number {
	return step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
}

interface ColorFormat {
	/** colorjs space id to serialise into for the binding. */
	spaceId: string;
	isHex: boolean;
	/** sRGB serialised as legacy `rgba(r, g, b, a)` — the "CSS" mode. */
	isCss: boolean;
	hasAlpha: boolean;
}

type Coords3 = [number, number, number];

/** Coalesce null / NaN (e.g. a powerless OKLCH hue on a grey) to 0. */
function num(x: number | null | undefined): number {
	return x == null || Number.isNaN(x) ? 0 : x;
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, x));
}

/** Does colorjs accept this exact string as a colour? */
function parses(s: string): boolean {
	try {
		getColor(parse(s));
		return true;
	} catch {
		return false;
	}
}

/** First embedded colour token (a hex literal or a colour function) in text. */
const COLOR_TOKEN =
	/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|(?:rgba?|hsla?|hwb|(?:ok)?lab|(?:ok)?lch|color)\([^)]*\)/i;

/**
 * Recover a colour from a messy paste, the way a good colour input should. The
 * caller has already tried a straight parse; here we strip CSS-declaration noise
 * — a leading `prop:`, a trailing `;`/`,`/`!important`, wrapping quotes — and,
 * failing that, pull the first colour token out of the surrounding text (so
 * `color: #ff0000;`, `"#ff0000"`, `rgb(0 0 0) !important`, even
 * `var(--x, #ff0000)` resolve). Returns null when nothing parseable is found.
 */
function extractColorString(trimmed: string): string | null {
	const stripped = trimmed
		.replace(/^[a-z-]+\s*:\s*/i, '') // leading CSS property name
		.replace(/\s*!important\s*$/i, '') // !important flag
		.replace(/[;,]+\s*$/, '') // trailing ; or ,
		.replace(/^["'`]+|["'`]+$/g, '') // wrapping quotes / backticks
		.trim();
	if (stripped !== trimmed && parses(stripped)) {
		return stripped;
	}
	const token = COLOR_TOKEN.exec(trimmed)?.[0];
	return token && parses(token) ? token : null;
}

export class OklchColor {
	/** Canonical OKLCH coords: [L 0..1, C 0..~0.4, H 0..360]. */
	readonly coords: Readonly<Coords3>;
	readonly alpha: number;
	private readonly format: ColorFormat;
	/** Verbatim source string; returned by `serialize()` until edited (then null). */
	private readonly source: string | null;

	private constructor(
		coords: Coords3,
		alpha: number,
		format: ColorFormat,
		source: string | null,
	) {
		// Clamp to sane bounds at the single construction choke point, so typed or
		// parsed nonsense (e.g. a chroma of 40000 in the colour text field) can't
		// take hold. Every real colour already sits inside these.
		this.coords = [
			clamp(coords[0], 0, 1),
			clamp(coords[1], 0, MAX_CHROMA),
			clamp(coords[2], 0, 360),
		];
		this.alpha = clamp(alpha, 0, 1);
		this.format = format;
		this.source = source;
	}

	/** A copy marked as edited: drops the verbatim `source` string so `serialize()`
	 *  recomputes from the (clamped) coords. Used when the colour text field is
	 *  typed into, so an out-of-range entry shows as its clamped value rather than
	 *  echoing the nonsense back. */
	asEdited(): OklchColor {
		return new OklchColor(
			[this.coords[0], this.coords[1], this.coords[2]],
			this.alpha,
			this.format,
			null,
		);
	}

	private oklchObj(withAlpha = true): ColorConstructor {
		// Opaque colours use alpha 1 (not null): colorjs serialises a null alpha
		// as `/ none` / hex `00`, which renders transparent. alpha 1 is omitted
		// from the output by default, so this stays clean for opaque values.
		return {
			spaceId: 'oklch',
			coords: [this.coords[0], this.coords[1], this.coords[2]],
			alpha: withAlpha && this.format.hasAlpha ? this.alpha : 1,
		};
	}

	// ---- Parsing ------------------------------------------------------------

	static fromString(css: string): OklchColor {
		const trimmed = css.trim();
		// Clean input parses straight through (keeping its verbatim source format);
		// a messy paste is sanitised — `extractColorString` recovers the colour from
		// a CSS declaration / quoted value / `!important`, or rethrows on nonsense.
		let source = trimmed;
		let parsed;
		try {
			parsed = getColor(parse(trimmed));
		} catch (err) {
			const cleaned = extractColorString(trimmed);
			if (cleaned === null) {
				throw err;
			}
			source = cleaned;
			parsed = getColor(parse(cleaned));
		}

		const sid = parsed.space.id;
		const k = sid === 'oklch' ? parsed : to(parsed, 'oklch');
		const coords: Coords3 = [
			num(k.coords[0]),
			num(k.coords[1]),
			num(k.coords[2]),
		];
		const alpha = parsed.alpha == null ? 1 : num(parsed.alpha);

		const isHex = source.startsWith('#');
		// Legacy comma syntax (`rgb(r, g, b)` / `rgba(r, g, b, a)`) is the CSS mode;
		// the modern space-separated `rgb(r g b)` stays plain RGB.
		const isCss = /^rgba?\(/i.test(source) && source.includes(',');
		const hasAlpha =
			alpha < 1 ||
			/^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(source) ||
			/\b(?:rgba|hsla)\s*\(/i.test(source) ||
			source.includes('/');

		const format: ColorFormat = {
			spaceId: isHex ? 'srgb' : sid,
			isHex,
			isCss,
			hasAlpha,
		};
		return new OklchColor(coords, alpha, format, source);
	}

	static tryFromString(css: string): OklchColor | null {
		try {
			return OklchColor.fromString(css);
		} catch {
			return null;
		}
	}

	/** Predicate for `accept`: is this a string the model can parse? */
	static isColorString(value: unknown): value is string {
		return (
			typeof value === 'string' && OklchColor.tryFromString(value) !== null
		);
	}

	// ---- Serialisation ------------------------------------------------------

	/** CSS string for the binding, in the remembered/selected output format. */
	serialize(): string {
		if (this.source !== null) {
			return this.source;
		}
		const f = this.format;
		if (f.isHex) {
			// collapse:false keeps full-length hex (#ffffff, never #fff).
			return serialize(to(this.oklchObj(), 'srgb', {inGamut: true}), {
				format: 'hex',
				collapse: false,
			});
		}
		if (f.isCss) {
			// Legacy comma syntax, always 4-arg: `rgba(r, g, b, a)`.
			const c = to(this.oklchObj(false), 'srgb', {inGamut: true});
			const ch = (i: number) => Math.round(num(c.coords[i]) * 255);
			return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${+this.alpha.toFixed(2)})`;
		}
		if (f.spaceId === 'srgb') {
			// colorjs only emits percentage rgb; build 0–255 integers (the form
			// people expect) instead.
			const c = to(this.oklchObj(false), 'srgb', {inGamut: true});
			const ch = (i: number) => Math.round(num(c.coords[i]) * 255);
			const a = f.hasAlpha ? ` / ${+this.alpha.toFixed(3)}` : '';
			return `rgb(${ch(0)} ${ch(1)} ${ch(2)}${a})`;
		}
		return serialize(to(this.oklchObj(), f.spaceId), {precision: 4});
	}

	/**
	 * The collapsed-row string: the *same rounded channel values the open inputs
	 * show* (via `channelValues` + `digitsFor`), with channel units but no function
	 * wrapper or colour-space name — so the row reads like the inputs and never
	 * repeats the mode dropdown's label. `wrapReadout` turns it back into CSS for
	 * editing. Distinct from `serialize()`, which keeps full precision for the value.
	 */
	readoutString(): string {
		const mode = this.mode;
		if (mode === 'hex') {
			return this.gamutCss();
		}
		const chans = MODE_CHANNELS[mode];
		const v = this.channelValues(mode);
		const s = (i: number): string => v[i].toFixed(digitsFor(chans[i].step));
		if (mode === 'css') {
			// CSS mode IS the legacy function form, so the row shows it in full
			// (always 4-arg) rather than as bare channels.
			return `rgba(${s(0)}, ${s(1)}, ${s(2)}, ${+this.alpha.toFixed(2)})`;
		}
		const a = this.format.hasAlpha ? ` / ${this.alpha.toFixed(2)}` : '';
		switch (mode) {
			case 'oklch':
			case 'oklab':
			case 'lch':
			case 'lab':
				return `${s(0)}% ${s(1)} ${s(2)}${a}`; // L is a percentage
			case 'hsl':
			case 'hwb':
				return `${s(0)} ${s(1)}% ${s(2)}%${a}`; // S/L or W/B are percentages
			case 'srgb':
			case 'p3':
			case 'rec2020':
				return `${s(0)} ${s(1)} ${s(2)}${a}`; // bare R G B
		}
	}

	/** Re-wrap the bare `readoutString()` channels into a full CSS string for the
	 *  current mode, so a typed edit of the collapsed row round-trips. */
	wrapReadout(text: string): string {
		switch (this.mode) {
			case 'hex':
				return text;
			case 'srgb':
				return `rgb(${text})`;
			case 'css':
				return `rgba(${text})`;
			case 'hsl':
				return `hsl(${text})`;
			case 'hwb':
				return `hwb(${text})`;
			case 'p3':
				return `color(display-p3 ${text})`;
			case 'rec2020':
				return `color(rec2020 ${text})`;
			default:
				return `${this.mode}(${text})`; // oklch / oklab / lch / lab
		}
	}

	/** Full-gamut CSS (`oklch(…)`) for painting the swatch in modern browsers. */
	displayCss(): string {
		return serialize(to(this.oklchObj(), 'oklch'));
	}

	/** Gamut-mapped sRGB hex, for the swatch fallback / hex field. Always
	 *  full-length (`collapse:false` → `#ffffff`, never `#fff`). */
	gamutCss(): string {
		return serialize(to(this.oklchObj(), 'srgb', {inGamut: true}), {
			format: 'hex',
			collapse: false,
		});
	}

	// ---- Channel access -----------------------------------------------------

	/** Canonical coords converted into `mode`'s colorjs space (NaN coalesced to 0). */
	coordsIn(mode: EditMode): {coords: Coords3; alpha: number} {
		const sid = modeSpaceId(mode);
		const c = sid === 'oklch' ? this.oklchObj() : to(this.oklchObj(), sid);
		return {
			coords: [num(c.coords[0]), num(c.coords[1]), num(c.coords[2])],
			alpha: this.alpha,
		};
	}

	/** Per-channel values in display units for `mode`'s numeric inputs. */
	channelValues(mode: Exclude<EditMode, 'hex'>): number[] {
		const {coords} = this.coordsIn(mode);
		return MODE_CHANNELS[mode].map((ch, i) => {
			const v = coords[i] * ch.scale;
			// Snap float noise to 0 (so an achromatic/gamut-edge channel never shows as
			// "-0.00"), then clamp to the channel's range — matching the numeric inputs'
			// range constraint, so the inputs and the collapsed readout agree.
			return clamp(Math.abs(v) < 1e-4 ? 0 : v, ch.min, ch.max);
		});
	}

	/** New colour with channel `index` of `mode` set to `displayValue`. */
	withChannel(
		mode: Exclude<EditMode, 'hex'>,
		index: number,
		displayValue: number,
	): OklchColor {
		const sid = modeSpaceId(mode);
		const {coords, alpha} = this.coordsIn(mode);
		const next: Coords3 = [coords[0], coords[1], coords[2]];
		next[index] = displayValue / MODE_CHANNELS[mode][index].scale;
		const k = to({spaceId: sid, coords: next, alpha}, 'oklch');
		return new OklchColor(
			[num(k.coords[0]), num(k.coords[1]), num(k.coords[2])],
			alpha,
			this.format,
			null,
		);
	}

	withAlpha(alpha: number): OklchColor {
		return new OklchColor(
			[this.coords[0], this.coords[1], this.coords[2]],
			alpha,
			{...this.format, hasAlpha: true},
			null,
		);
	}

	/** Whether the bound value carries an alpha channel (drives the alpha UI). */
	get hasAlpha(): boolean {
		return this.format.hasAlpha;
	}

	/** The edit mode the value currently serialises as (its output format). */
	get mode(): EditMode {
		if (this.format.isHex) {
			return 'hex';
		}
		if (this.format.isCss) {
			return 'css';
		}
		// EditMode values are colorjs space ids, so a known space maps straight to
		// its mode; anything else (a98-rgb, xyz, …) falls back to OKLCH.
		const id = this.format.spaceId;
		return (EDIT_MODES as string[]).includes(id) ? (id as EditMode) : 'oklch';
	}

	/**
	 * New colour serialised in `mode`'s format. The sRGB-bound modes (RGB / HSL /
	 * HWB / HEX) can't hold a wider-gamut colour, so switching into one snaps it to
	 * the nearest in-sRGB colour; the perceptual (OKLCH / OKLab / LCH / Lab) and
	 * wide-RGB (P3 / Rec2020) modes keep the colour untouched.
	 */
	withFormat(mode: EditMode): OklchColor {
		let coords: Coords3 = [this.coords[0], this.coords[1], this.coords[2]];
		if (SRGB_BOUND_MODES.includes(mode) && !this.inGamut('srgb')) {
			const back = to(
				to(this.oklchObj(false), 'srgb', {inGamut: true}),
				'oklch',
			);
			coords = [num(back.coords[0]), num(back.coords[1]), num(back.coords[2])];
		}
		return new OklchColor(
			coords,
			this.alpha,
			{
				spaceId: modeSpaceId(mode),
				isHex: mode === 'hex',
				isCss: mode === 'css',
				hasAlpha: this.format.hasAlpha,
			},
			null,
		);
	}

	/** OKLCH hue (degrees) — the fixed axis of the locked L×C area plane. */
	areaHue(): number {
		return this.coords[2];
	}

	/** New colour with the area plane's fixed hue (OKLCH H) set to `hue` (degrees). */
	withAreaHue(hue: number): OklchColor {
		return new OklchColor(
			[this.coords[0], this.coords[1], num(hue)],
			this.alpha,
			this.format,
			null,
		);
	}

	/** Adopt coords from an arbitrary CSS string (e.g. the area picker's onChange). */
	withCss(css: string): OklchColor {
		const k = to(getColor(parse(css)), 'oklch');
		return new OklchColor(
			[num(k.coords[0]), num(k.coords[1]), num(k.coords[2])],
			this.alpha,
			this.format,
			null,
		);
	}

	// ---- Misc ---------------------------------------------------------------

	inGamut(gamut: Gamut): boolean {
		return cjsInGamut(to(this.oklchObj(false), gamut));
	}

	/** sRGB and P3 are the only gamuts with real consumer displays, so the readout
	 *  names those two and lumps anything beyond P3 as "wide". */
	gamutLabel(): string {
		if (this.inGamut('srgb')) {
			return 'sRGB';
		}
		if (this.inGamut('p3')) {
			return 'P3';
		}
		return 'wide';
	}

	equals(other: OklchColor): boolean {
		const e = 1e-6;
		return (
			// Output format is part of identity, so switching mode counts as a change
			// (re-serialises + re-renders the collapsed readout).
			this.format.spaceId === other.format.spaceId &&
			this.format.isHex === other.format.isHex &&
			this.format.isCss === other.format.isCss &&
			Math.abs(this.coords[0] - other.coords[0]) < e &&
			Math.abs(this.coords[1] - other.coords[1]) < e &&
			Math.abs(this.coords[2] - other.coords[2]) < e &&
			Math.abs(this.alpha - other.alpha) < e
		);
	}
}
