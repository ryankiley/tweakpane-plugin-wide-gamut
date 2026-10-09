/*
 * Internal colour model for the OKLCH plugin — a thin immutable wrapper over the
 * in-house colour engine in ../core.
 *
 * Canonical representation is OKLCH: it is the picker's working space and is
 * lossless across sRGB / Display-P3 / Rec2020, so dragging into the wide-gamut
 * region of the area picker never clips mid-edit. The binding's *source format*
 * (hex / rgb() / oklch() / color(display-p3 …) …) is remembered so values
 * round-trip in whatever shape the user supplied, and the verbatim source string
 * is returned unchanged until the colour is actually edited.
 */
import type {RgbGamut, Space} from '../core/convert.js';
import {convert} from '../core/convert.js';
import {inGamut as inGamutOf, maxChroma, toGamut} from '../core/gamut.js';
import {parse} from '../core/parse.js';
import {serialize} from '../core/serialize.js';

/** Editing modes offered by the mode dropdown. Each value is an engine space id
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

/** What a value serialises as: an edit mode, or `prophoto-rgb` — accepted as
 *  input (`color(prophoto-rgb …)`) and round-tripped as such, though it has no
 *  edit mode of its own (the dropdown shows it as OKLCH). */
type OutputFormat = EditMode | 'prophoto-rgb';

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
function showsGamutBoundary(mode: EditMode): boolean {
	return !SRGB_BOUND_MODES.includes(mode);
}

/** The gamut the colour area stretches to in a given mode: sRGB for the
 *  sRGB-bound modes, P3 for every wide mode (P3, Rec2020, and the perceptual
 *  OKLCH/OKLab/LCH/Lab). P3 is the widest gamut real displays render, so the
 *  plane's edge is the displayable limit — the thumb can't slide into colours
 *  the screen can't show. The sRGB boundary stays as the inner reference line. */
export function areaStretch(mode: EditMode): RgbGamut {
	return SRGB_BOUND_MODES.includes(mode) ? 'srgb' : 'p3';
}

/** Hard cap on OKLCH chroma. Beyond any real display gamut (ProPhoto tops out
 *  near 0.49), so it rejects nonsense input (e.g. a typed chroma of 40000)
 *  without ever clipping a colour that could actually be shown. */
const MAX_CHROMA = 0.5;

/** Below this chroma a colour is achromatic and its hue is powerless (CSS Color 4
 *  §"missing components"). Parsed greys land around 1e-16; the faintest tint an
 *  8-bit sRGB value can carry (`#808081`) is ~1.5e-3, so 1e-4 splits them cleanly. */
const POWERLESS_CHROMA = 1e-4;
const achromatic = (chroma: number): boolean => chroma < POWERLESS_CHROMA;

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

/** Colour-engine space backing an output format (hex + css share sRGB). */
function spaceOf(out: OutputFormat): Space {
	return out === 'hex' || out === 'css' ? 'srgb' : out;
}

/** A single numeric channel input for a mode. `display = coord * scale`. */
export interface ChannelDescriptor {
	key: string;
	min: number;
	max: number;
	step: number;
	/** Multiplier from the canonical engine coord to the displayed value. */
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
const RGB_255: ChannelDescriptor[] = [
	{key: 'r', min: 0, max: 255, step: 1, scale: 255},
	{key: 'g', min: 0, max: 255, step: 1, scale: 255},
	{key: 'b', min: 0, max: 255, step: 1, scale: 255},
];
const RGB_UNIT: ChannelDescriptor[] = [
	{key: 'r', min: 0, max: 1, step: 0.01, scale: 1},
	{key: 'g', min: 0, max: 1, step: 0.01, scale: 1},
	{key: 'b', min: 0, max: 1, step: 0.01, scale: 1},
];

export const MODE_CHANNELS: Record<
	Exclude<EditMode, 'hex'>,
	ChannelDescriptor[]
> = {
	oklch: [
		{key: 'l', min: 0, max: 100, step: 1, scale: 100},
		{key: 'c', min: 0, max: MAX_CHROMA, step: 0.01, scale: 1},
		{key: 'h', min: 0, max: 360, step: 1, scale: 1},
	],
	oklab: [
		{key: 'l', min: 0, max: 100, step: 1, scale: 100},
		{key: 'a', min: -0.4, max: 0.4, step: 0.01, scale: 1},
		{key: 'b', min: -0.4, max: 0.4, step: 0.01, scale: 1},
	],
	lch: [
		{key: 'l', min: 0, max: 100, step: 1, scale: 1},
		{key: 'c', min: 0, max: 150, step: 1, scale: 1},
		{key: 'h', min: 0, max: 360, step: 1, scale: 1},
	],
	lab: [
		{key: 'l', min: 0, max: 100, step: 1, scale: 1},
		{key: 'a', min: -125, max: 125, step: 1, scale: 1},
		{key: 'b', min: -125, max: 125, step: 1, scale: 1},
	],
	srgb: RGB_255,
	// CSS mode = sRGB channels, output as legacy `rgba(r, g, b, a)`.
	css: RGB_255,
	hsl: [
		{key: 'h', min: 0, max: 360, step: 1, scale: 1},
		{key: 's', min: 0, max: 100, step: 1, scale: 1},
		{key: 'l', min: 0, max: 100, step: 1, scale: 1},
	],
	hwb: [
		{key: 'h', min: 0, max: 360, step: 1, scale: 1},
		{key: 'w', min: 0, max: 100, step: 1, scale: 1},
		{key: 'b', min: 0, max: 100, step: 1, scale: 1},
	],
	p3: RGB_UNIT,
	rec2020: RGB_UNIT,
};

/** Decimal places a channel is displayed at, from its step — shared by the open
 *  numeric inputs and the collapsed readout so they round identically. */
export function digitsFor(step: number): number {
	return step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
}

interface ColorFormat {
	out: OutputFormat;
	hasAlpha: boolean;
}

/** The text form of each numeric mode: the function the bare readout is
 *  wrapped in to make CSS again, and which channels carry a `%` (the L of the
 *  perceptual spaces; S/L and W/B). */
const MODE_FORM: Record<
	Exclude<EditMode, 'hex'>,
	{open: string; pct: [boolean, boolean, boolean]}
> = {
	oklch: {open: 'oklch(', pct: [true, false, false]},
	oklab: {open: 'oklab(', pct: [true, false, false]},
	lch: {open: 'lch(', pct: [true, false, false]},
	lab: {open: 'lab(', pct: [true, false, false]},
	srgb: {open: 'rgb(', pct: [false, false, false]},
	css: {open: 'rgba(', pct: [false, false, false]},
	hsl: {open: 'hsl(', pct: [false, true, true]},
	hwb: {open: 'hwb(', pct: [false, true, true]},
	p3: {open: 'color(display-p3 ', pct: [false, false, false]},
	rec2020: {open: 'color(rec2020 ', pct: [false, false, false]},
};

type Coords3 = [number, number, number];

/** Coalesce null / NaN (e.g. a powerless OKLCH hue on a grey) to 0. */
function num(x: number | null | undefined): number {
	return x == null || Number.isNaN(x) ? 0 : x;
}

/** Clamp to [lo, hi]; NaN (which Math.min/max would pass through) lands on `lo`,
 *  so the construction choke point never stores a NaN coordinate or alpha. */
function clamp(x: number, lo: number, hi: number): number {
	return Number.isNaN(x) ? lo : Math.min(hi, Math.max(lo, x));
}

/** Does the engine accept this exact string as a colour? */
function parses(s: string): boolean {
	return parse(s) !== null;
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
	if (!token) {
		return null;
	}
	if (parses(token)) {
		return token;
	}
	// Last resort: a colour whose only fault is mixed separators — legacy commas
	// plus a `/ alpha` (`rgb(255, 0, 0 / 0.5)`), which the strict parser rejects.
	// Normalise the commas to spaces and retry, keeping the real channels and the
	// alpha. A genuinely missing channel collapses away and still fails (too few
	// channels) — it is never invented.
	const normalised = token.replace(
		/^([a-z]+)\((.*)\)$/i,
		(_m, fn: string, inner: string) => `${fn}(${inner.replace(/,/g, ' ')})`,
	);
	return normalised !== token && parses(normalised) ? normalised : null;
}

export class OklchColor {
	/** Canonical OKLCH coords: [L 0..1, C 0..~0.4, H 0..360]. */
	readonly coords: Readonly<Coords3>;
	readonly alpha: number;
	private readonly format: ColorFormat;
	/** Verbatim source string; returned by `serialize()` until edited (then null). */
	private readonly source: string | null;
	/** The hue is parser noise, not a choice: the colour was parsed achromatic
	 *  and nothing since has set a hue. See `hueIsPowerless`. */
	private readonly huePowerless: boolean;

	private constructor(
		coords: Coords3,
		alpha: number,
		format: ColorFormat,
		source: string | null,
		huePowerless = false,
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
		this.huePowerless = huePowerless;
	}

	/** A copy marked as edited: drops the verbatim `source` string so `serialize()`
	 *  recomputes from the (clamped) coords. Used when the colour text field is
	 *  typed into, so an out-of-range entry shows as its clamped value rather than
	 *  echoing the nonsense back. */
	asEdited(): OklchColor {
		return new OklchColor(
			this.oklch(),
			this.alpha,
			this.format,
			null,
			this.huePowerless,
		);
	}

	/** Mutable copy of the canonical OKLCH coords (engine functions take a tuple). */
	private oklch(): Coords3 {
		return [this.coords[0], this.coords[1], this.coords[2]];
	}

	/** Alpha to serialise: opaque colours (or formats without alpha) use 1, which
	 *  the serialiser omits — so the output stays clean. */
	private outAlpha(): number {
		return this.format.hasAlpha ? this.alpha : 1;
	}

	/** Coords to serialise for output `space`: gamut-mapped for the bounded spaces
	 *  (RGB + HSL/HWB), matching how the old colorjs serialise mapped them; raw for
	 *  the unbounded perceptual spaces (OKLCH/OKLab/LCH/Lab). */
	private outputCoords(space: Space): Coords3 {
		let c: Coords3;
		switch (space) {
			case 'srgb':
			case 'p3':
			case 'rec2020':
			case 'prophoto-rgb':
				c = toGamut(this.oklch(), space);
				break;
			case 'hsl':
			case 'hwb':
				// sRGB→HSL/HWB hands back a NaN ("powerless") hue for an achromatic
				// colour such as pure black; num() below folds it to 0 so serialize()
				// never emits a literal "NaN" — matching the 0 the inputs/readout show.
				c = convert(toGamut(this.oklch(), 'srgb'), 'srgb', space);
				break;
			default:
				c = convert(this.oklch(), 'oklch', space);
		}
		return [num(c[0]), num(c[1]), num(c[2])];
	}

	// ---- Parsing ------------------------------------------------------------

	static fromString(css: string): OklchColor {
		const trimmed = css.trim();
		// Clean input parses straight through (keeping its verbatim source format);
		// a messy paste is sanitised — `extractColorString` recovers the colour from
		// a CSS declaration / quoted value / `!important`, or we throw on nonsense.
		let source = trimmed;
		let parsed = parse(trimmed);
		if (!parsed) {
			const cleaned = extractColorString(trimmed);
			if (cleaned === null) {
				throw new Error(`unparseable colour: ${css}`);
			}
			source = cleaned;
			parsed = parse(cleaned);
			if (!parsed) {
				throw new Error(`unparseable colour: ${css}`);
			}
		}

		const sid = parsed.space;
		const k =
			sid === 'oklch' ? parsed.coords : convert(parsed.coords, sid, 'oklch');
		const coords: Coords3 = [num(k[0]), num(k[1]), num(k[2])];
		const alpha = num(parsed.alpha);

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
			out: isHex ? 'hex' : isCss ? 'css' : sid,
			hasAlpha,
		};
		return new OklchColor(coords, alpha, format, source, achromatic(coords[1]));
	}

	static tryFromString(css: string): OklchColor | null {
		try {
			return OklchColor.fromString(css);
		} catch {
			return null;
		}
	}

	// ---- Serialisation ------------------------------------------------------

	/** CSS string for the binding, in the remembered/selected output format. */
	serialize(): string {
		if (this.source !== null) {
			return this.source;
		}
		const f = this.format;
		if (f.out === 'hex') {
			// Always full-length hex (#ffffff, never #fff); 8 digits when alpha < 1.
			return this.gamutCss();
		}
		if (f.out === 'css') {
			// Legacy comma syntax, always 4-arg: `rgba(r, g, b, a)`.
			const c = toGamut(this.oklch(), 'srgb');
			const ch = (i: number) => Math.round(num(c[i]) * 255);
			return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${+this.alpha.toFixed(2)})`;
		}
		if (f.out === 'srgb') {
			// 0–255 integer rgb() (the form people expect), space-separated.
			const c = toGamut(this.oklch(), 'srgb');
			const ch = (i: number) => Math.round(num(c[i]) * 255);
			const a = f.hasAlpha ? ` / ${+this.alpha.toFixed(3)}` : '';
			return `rgb(${ch(0)} ${ch(1)} ${ch(2)}${a})`;
		}
		return serialize(this.outputCoords(f.out), f.out, this.outAlpha(), {
			precision: 4,
		});
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
		const v = this.channelValues(mode);
		const s = MODE_CHANNELS[mode].map(
			(ch, i) =>
				v[i].toFixed(digitsFor(ch.step)) + (MODE_FORM[mode].pct[i] ? '%' : ''),
		);
		if (mode === 'css') {
			// CSS mode IS the legacy function form, so the row shows it in full
			// (always 4-arg) rather than as bare channels.
			return `rgba(${s[0]}, ${s[1]}, ${s[2]}, ${+this.alpha.toFixed(2)})`;
		}
		const a = this.format.hasAlpha ? ` / ${this.alpha.toFixed(2)}` : '';
		return `${s.join(' ')}${a}`;
	}

	/** Re-wrap the bare `readoutString()` channels into a full CSS string for the
	 *  current mode, so a typed edit of the collapsed row round-trips. */
	wrapReadout(text: string): string {
		const mode = this.mode;
		return mode === 'hex' ? text : `${MODE_FORM[mode].open}${text})`;
	}

	/** Full-gamut CSS (`oklch(…)`) for painting the swatch in modern browsers. */
	displayCss(): string {
		return serialize(this.oklch(), 'oklch', this.outAlpha());
	}

	/** Gamut-mapped sRGB hex, for the HEX mode's text field and the collapsed
	 *  readout in that mode. Always full-length (`#ffffff`, never `#fff`). */
	gamutCss(): string {
		return serialize(toGamut(this.oklch(), 'srgb'), 'srgb', this.outAlpha(), {
			format: 'hex',
		});
	}

	// ---- Channel access -----------------------------------------------------

	/** Canonical coords converted into `mode`'s space (NaN coalesced to 0). */
	coordsIn(mode: EditMode): Coords3 {
		const c = convert(this.oklch(), 'oklch', spaceOf(mode));
		return [num(c[0]), num(c[1]), num(c[2])];
	}

	/** Per-channel values in display units for `mode`'s numeric inputs. */
	channelValues(mode: Exclude<EditMode, 'hex'>): number[] {
		const coords = this.coordsIn(mode);
		return MODE_CHANNELS[mode].map((ch, i) => {
			const v = coords[i] * ch.scale;
			// Snap to 0 anything that rounds to 0 at the channel's display precision
			// (half the step), so a tiny negative never renders as "-0.00"/"-0", then
			// clamp to the channel's range — matching the numeric inputs' range
			// constraint, so the inputs and the collapsed readout agree.
			return clamp(Math.abs(v) < 0.5 * ch.step ? 0 : v, ch.min, ch.max);
		});
	}

	/** New colour with channel `index` of `mode` set to `displayValue`. */
	withChannel(
		mode: Exclude<EditMode, 'hex'>,
		index: number,
		displayValue: number,
	): OklchColor {
		const next = this.coordsIn(mode);
		next[index] = displayValue / MODE_CHANNELS[mode][index].scale;
		const k = convert(next, spaceOf(mode), 'oklch');
		const c: Coords3 = [num(k[0]), num(k[1]), num(k[2])];
		// Setting a hue channel is a choice; so is giving the colour chroma (its
		// hue now shows). Anything else on a grey leaves the hue as unchosen.
		const powerless =
			this.huePowerless &&
			MODE_CHANNELS[mode][index].key !== 'h' &&
			achromatic(c[1]);
		return new OklchColor(c, this.alpha, this.format, null, powerless);
	}

	withAlpha(alpha: number): OklchColor {
		// A non-finite alpha is never a choice (a strip event with no layout box,
		// a bad caller) — in every output format it would either print as `NaN`
		// or silently drop the alpha, so it leaves the colour alone.
		if (!Number.isFinite(alpha)) {
			return this;
		}
		return new OklchColor(
			this.oklch(),
			alpha,
			{...this.format, hasAlpha: true},
			null,
			this.huePowerless,
		);
	}

	/** Whether the bound value carries an alpha channel (drives the alpha UI). */
	get hasAlpha(): boolean {
		return this.format.hasAlpha;
	}

	/** The edit mode the value currently serialises as (its output format). */
	get mode(): EditMode {
		const out = this.format.out;
		return out === 'prophoto-rgb' ? 'oklch' : out;
	}

	/**
	 * New colour serialised in `mode`'s format. The sRGB-bound modes (RGB / HSL /
	 * HWB / HEX) can't hold a wider-gamut colour, so switching into one snaps it to
	 * the nearest in-sRGB colour; the perceptual (OKLCH / OKLab / LCH / Lab) and
	 * wide-RGB (P3 / Rec2020) modes keep the colour untouched.
	 */
	withFormat(mode: EditMode): OklchColor {
		// Switching into an sRGB-bound mode snaps a wider colour to the nearest
		// in-sRGB one (so its channels stay meaningful); the area itself stays freely
		// selectable, and the perceptual / wide-RGB modes keep the colour untouched.
		let coords: Coords3 = this.oklch();
		if (SRGB_BOUND_MODES.includes(mode) && !this.inGamut('srgb')) {
			const back = convert(toGamut(this.oklch(), 'srgb'), 'srgb', 'oklch');
			coords = [num(back[0]), num(back[1]), num(back[2])];
		}
		return new OklchColor(
			coords,
			this.alpha,
			{out: mode, hasAlpha: this.format.hasAlpha},
			null,
			this.huePowerless,
		);
	}

	/** OKLCH hue (degrees) — the fixed axis of the locked L×C area plane. */
	areaHue(): number {
		return this.coords[2];
	}

	/**
	 * New colour with the area plane's fixed hue (OKLCH H) set to `hue` (degrees).
	 *
	 * With `gamut` (the plane's stretch gamut), chroma is rescaled so the colour
	 * keeps its *position on the plane*: the same fraction of the row's chroma
	 * ceiling at the new hue as at the old. The gamut's edge moves a lot with hue
	 * (P3 at L 0.5 spans ~0.12 at hue 220 to ~0.28 at 300), so holding chroma
	 * constant would slide the thumb sideways — and off the edge into colours the
	 * plane can't show — on every hue drag. A colour already past the edge keeps
	 * the same ratio past it (nothing is clamped). Without `gamut`, chroma is held
	 * as is.
	 */
	withAreaHue(hue: number, gamut?: RgbGamut): OklchColor {
		// Same as withAlpha: a non-finite hue would land on hue 0 (green → pink),
		// and it is never a choice, so it is a no-op.
		if (!Number.isFinite(hue)) {
			return this;
		}
		const [L, C, H] = this.coords;
		const h = hue;
		let c = C;
		if (gamut !== undefined) {
			const was = maxChroma(L, H, gamut);
			c = was > 0 ? (C / was) * maxChroma(L, h, gamut) : 0;
		}
		return this.withHue(h, c, null);
	}

	/** Copy with hue `h` (and chroma `c`); the hue counts as chosen unless the
	 *  caller says it is still `powerless` (inherited from another unchosen grey). */
	private withHue(
		h: number,
		c: number,
		source: string | null,
		powerless = false,
	): OklchColor {
		return new OklchColor(
			[this.coords[0], c, h],
			this.alpha,
			this.format,
			source,
			powerless,
		);
	}

	/**
	 * Whether the hue is parser noise rather than anything chosen. `#808080`
	 * parses to an arbitrary hue; that stays "unchosen" through edits that don't
	 * touch hue (alpha, format, a typed re-entry) and is settled the moment a hue
	 * is set — by the plane or hue strip, a hue channel, or `withRetainedHue`.
	 * The binding and the text fields use this to hand a fresh grey the hue the
	 * picker is already on, so the plane never jumps to noise.
	 */
	get hueIsPowerless(): boolean {
		return this.huePowerless;
	}

	/** Same colour with the (powerless) hue replaced by `hue`. Keeps the verbatim
	 *  source, so `serialize()` still returns the string the binding supplied —
	 *  for an achromatic colour the hue changes nothing about the colour itself. */
	withRetainedHue(hue: number): OklchColor {
		return this.withHue(num(hue), this.coords[1], this.source);
	}

	/** If this colour's hue is powerless, take `prev`'s hue (the one the picker
	 *  is on); otherwise unchanged. For a colour typed into a text field. If
	 *  `prev`'s hue was itself never chosen, the result stays unchosen too — the
	 *  plane holds still, but nothing records that noise as a real hue. */
	inheritHue(prev: OklchColor): OklchColor {
		return this.huePowerless
			? this.withHue(
					prev.areaHue(),
					this.coords[1],
					this.source,
					prev.huePowerless,
			  )
			: this;
	}

	/** Adopt OKLCH coords (the area plane's onChange). A position on the plane
	 *  is a chosen hue, so the hue counts as settled. */
	withOklch(coords: Readonly<Coords3>): OklchColor {
		return new OklchColor(
			[num(coords[0]), num(coords[1]), num(coords[2])],
			this.alpha,
			this.format,
			null,
			false,
		);
	}

	// ---- Misc ---------------------------------------------------------------

	inGamut(gamut: Gamut): boolean {
		return inGamutOf(this.oklch(), 'oklch', gamut);
	}

	/**
	 * The OKLCH coords rounded to the precision the numeric inputs + collapsed
	 * readout actually show (`digitsFor`, in the current mode's space). `gamutLabel`
	 * reads this instead of the raw coords so the sRGB/P3/wide label can't flip on
	 * precision hidden beneath the displayed numbers — a chroma shown as `0.22`
	 * resolves to one gamut.
	 */
	private displayedOklch(): Coords3 {
		const mode = this.mode;
		if (mode === 'hex') {
			return this.oklch(); // no channels (and unreached: hex is sRGB-bound)
		}
		const vals = this.channelValues(mode);
		const rounded = MODE_CHANNELS[mode].map(
			(ch, i) => Number(vals[i].toFixed(digitsFor(ch.step))) / ch.scale,
		);
		const k = convert(
			[rounded[0], rounded[1], rounded[2]],
			spaceOf(mode),
			'oklch',
		);
		return [num(k[0]), num(k[1]), num(k[2])];
	}

	/** sRGB and P3 are the only gamuts with real consumer displays, so the readout
	 *  names those two and lumps anything beyond P3 as "wide".
	 *
	 *  In an sRGB-bound mode (RGB/HEX/CSS/HSL/HWB) the binding value is always a
	 *  gamut-mapped sRGB colour, so the readout is always sRGB — showing P3/wide
	 *  there would contradict the mode (the area can still be dragged into the wide
	 *  region, but the output clamps). In a wide mode it's the smallest containing
	 *  gamut, except in the degenerate near-black/near-white tips, where the chroma
	 *  is imperceptible and the displayed colour is ~black/white in every gamut —
	 *  reported as sRGB so the label doesn't churn as you drag the dark/light edges. */
	gamutLabel(): string {
		if (!showsGamutBoundary(this.mode)) {
			return 'sRGB';
		}
		const oklch = this.displayedOklch(); // at display precision, so it agrees with the numbers
		const shown = toGamut(oklch, 'srgb'); // colour as actually displayed
		if (Math.max(...shown) < 0.03 || Math.min(...shown) > 0.97) {
			return 'sRGB';
		}
		if (inGamutOf(oklch, 'oklch', 'srgb')) {
			return 'sRGB';
		}
		if (inGamutOf(oklch, 'oklch', 'p3')) {
			return 'P3';
		}
		return 'wide';
	}

	equals(other: OklchColor): boolean {
		const e = 1e-6;
		return (
			// Output format is part of identity, so switching mode counts as a change
			// (re-serialises + re-renders the collapsed readout).
			this.format.out === other.format.out &&
			this.format.hasAlpha === other.format.hasAlpha &&
			Math.abs(this.coords[0] - other.coords[0]) < e &&
			Math.abs(this.coords[1] - other.coords[1]) < e &&
			Math.abs(this.coords[2] - other.coords[2]) < e &&
			Math.abs(this.alpha - other.alpha) < e
		);
	}
}
